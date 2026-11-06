/* Beta — Manufacturing raw material.
 *   default export  Raw Material master (Manufacturing → Raw Material): list | add / edit — name, unit, HSN, GST,
 *                   minimum level and the opening stock (qty, rate, date, godown)
 *   RawStock        Raw Material Stock (Stock → Raw Material Stock): per item opening · received (GRN of "For stock" POs) ·
 *                   issued · returned · closing · average rate · value; red when below the minimum level
 * Average rate = (opening qty × opening rate + every purchase bill's taxable value) ÷ (opening qty + billed qty).
 * Issue / return to Job Cards come in the next step; until then those columns stay 0. */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, useClearSel } from './BetaSales';
import { num, fdate } from './BetaSalesBill';
import { n, r2, r3, key, today, loadGrns, grnQtyOf, billCounts } from './BetaPurchaseLib';
import { PX_CSS } from './BetaPurchaseParts';
import { printList, esc } from './BetaPurchasePrint';

const UNITS = ['KG', 'LTR', 'NOS', 'MTR', 'SQM', 'SET', 'BAG', 'ROLL'];
const EXTRA_CSS = '.rmx td { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .rmx .b { font-weight:700; } .rmx tr.low td { background:#FEF3F2; } .rmx .lowt { color:#B42318; font-weight:700; }';
const money = v => `₹ ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function BetaRawMaterial() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') === 'create' ? 'create' : 'list';
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const [rms, setRms] = useState(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState(null);
  const [slot, setSlot] = useState(null);

  useEffect(() => {
    if (!companyId) return;
    axios.get('/api/raw-materials', { params: { companyId } }).then(r => setRms(Array.isArray(r.data) ? r.data : [])).catch(() => setRms([]));
  }, [companyId, reload]);
  const cur = editing ? 'create' : tab;
  const go = k => { setEditing(null); navigate(`/beta/mfg/raw-material?tab=${k}`); };

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {[['list', 'Raw Materials'], ['create', editing ? `Edit ${editing.code}` : 'Add Raw Material']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={cur === k} className={`sb-tab${cur === k ? ' on' : ''}`} onClick={() => go(k)}>
            {label}{k === 'list' && rms && <span className="n">{rms.length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status">{note}<button type="button" onClick={() => setNote(null)} aria-label="Dismiss">×</button></div>}
      {cur === 'create'
        ? <div className="sb-body"><RmForm key={editing ? editing.rmId : 'new'} companyId={companyId} company={selectedCompany} edit={editing}
            onCancel={() => go('list')} onSaved={text => { setReload(x => x + 1); setNote(text); go('list'); }} /></div>
        : <RmList rms={rms} companyId={companyId} slot={slot} setNote={setNote} onEdit={r => { setNote(null); setEditing(r); }} onChanged={() => setReload(x => x + 1)} />}
    </div>
  );
}

function RmForm({ companyId, company, edit, onSaved, onCancel }) {
  const locations = Array.isArray(company?.locations) ? company.locations : [];
  const [v, setV] = useState(() => ({
    name: edit?.name || '', unit: edit?.unit || 'KG', category: edit?.category || '', hsnCode: edit?.hsnCode || '', gstPercent: String(edit?.gstPercent ?? 18),
    minLevel: edit?.minLevel ? String(edit.minLevel) : '', remarks: edit?.remarks || '',
    oQty: edit?.opening?.qty ? String(edit.opening.qty) : '', oRate: edit?.opening?.rate ? String(edit.opening.rate) : '',
    oDate: edit?.opening?.date || today(), oLoc: edit?.opening?.location || locations[0]?.name || '',
  }));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = k => e => { const x = e.target.value; setV(o => ({ ...o, [k]: x })); setMsg(null); };
  const numIn = k => e => { const x = e.target.value.replace(/[^\d.]/g, ''); setV(o => ({ ...o, [k]: x })); };

  const save = async () => {
    if (!v.name.trim()) return setMsg({ k: 'err', t: 'Enter the raw material name.' });
    setBusy(true);
    const payload = { companyId, name: v.name.trim(), unit: v.unit, category: v.category.trim(), hsnCode: v.hsnCode.trim(), gstPercent: n(v.gstPercent),
      minLevel: n(v.minLevel), remarks: v.remarks.trim(), opening: { qty: n(v.oQty), rate: n(v.oRate), date: v.oDate, location: v.oLoc.trim() } };
    try {
      const r = edit ? await axios.put(`/api/raw-materials/${edit.rmId}`, payload, { params: { companyId } }) : await axios.post('/api/raw-materials', payload, { params: { companyId } });
      onSaved(`${edit ? 'Updated' : 'Added'} ${r.data?.code || ''} ${payload.name}${payload.opening.qty ? ` — opening ${num(payload.opening.qty)} ${payload.unit}` : ''}.`);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save.' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="sf">
      <div className="sf-hero"><span className="ic"><Svg name="box" size={15} /></span><h1>{edit ? `Edit ${edit.code} · ${edit.name}` : 'Add Raw Material'}</h1><span className="grow" /></div>
      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Raw Material</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Name <i>*</i></th><td><input value={v.name} onChange={set('name')} placeholder="e.g. FRP Resin, Glass Fibre Mat 450 GSM" autoFocus /></td></tr>
            <tr><th>Unit</th><td><select value={v.unit} onChange={set('unit')}>{[...new Set([...UNITS, v.unit])].map(u => <option key={u}>{u}</option>)}</select></td></tr>
            <tr><th>Category</th><td><input value={v.category} onChange={set('category')} placeholder="e.g. Resin, Fibre, Chemical, Fitting" /></td></tr>
            <tr><th>HSN</th><td><input value={v.hsnCode} onChange={set('hsnCode')} placeholder="Optional" /></td></tr>
            <tr><th>GST %</th><td><select value={v.gstPercent} onChange={set('gstPercent')}>{['0', '5', '12', '18', '28'].map(g => <option key={g} value={g}>{g}%</option>)}</select></td></tr>
            <tr><th>Minimum level</th><td><input value={v.minLevel} onChange={numIn('minLevel')} inputMode="decimal" placeholder={`Alert when stock is below this (${v.unit})`} /></td></tr>
            <tr><th>Remarks</th><td><input value={v.remarks} onChange={set('remarks')} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="wallet" size={13} /></span><b>Opening stock</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>Qty</th><td><input value={v.oQty} onChange={numIn('oQty')} inputMode="decimal" placeholder={`Already in the godown (${v.unit}) — leave blank if none`} /></td></tr>
            <tr><th>Rate (₹ / {v.unit})</th><td><input value={v.oRate} onChange={numIn('oRate')} inputMode="decimal" placeholder="Purchase rate, without GST" /></td></tr>
            <tr><th>As on</th><td><input type="date" value={v.oDate} onChange={set('oDate')} /></td></tr>
            <tr><th>Godown</th><td>{locations.length
              ? <select value={v.oLoc} onChange={set('oLoc')}>{locations.map(l => <option key={l.name} value={l.name}>{l.name} ({l.type})</option>)}</select>
              : <input value={v.oLoc} onChange={set('oLoc')} placeholder="Godown / factory (add them in Admin → Company)" />}</td></tr>
            <tr><th>Value</th><td><b>{money(n(v.oQty) * n(v.oRate))}</b></td></tr>
          </tbody></table>
        </div>
      </div>
      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{edit ? <>Code <b>{edit.code}</b></> : 'The code (RM0001, RM0002…) is given on save.'}</div>
        <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit ? 'Update' : 'Save'}</button>
      </div>
    </div>
  );
}

function RmList({ rms, companyId, slot, setNote, onEdit, onChanged }) {
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(askDel ? null : selId, setSelId, '.sb-t tbody tr, .sb-tools, .sb-ask');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = (rms || []).filter(r => !words.length || words.every(x => `${r.code} ${r.name} ${r.category} ${r.hsnCode}`.toLowerCase().includes(x)));
  const sel = list.find(r => r.rmId === selId) || null;
  const doDelete = async r => {
    setBusy(true);
    try { await axios.delete(`/api/raw-materials/${r.rmId}`, { params: { companyId } }); setAskDel(null); setSelId(null); setNote(`Deleted ${r.code} ${r.name}.`); onChanged(); }
    catch (e) { setNote(e.response?.data?.error || 'Could not delete.'); }
    finally { setBusy(false); }
  };
  return (
    <>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search code, name, category…" aria-label="Search raw materials" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.code}</b></> : 'Click a row to select'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>
          <button type="button" className="sb-tbtn del" disabled={!sel} onClick={() => setAskDel(sel)}><Svg name="x" size={13} />Delete</button>
        </div>
      </>, slot)}
      {askDel && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete {askDel.code} {askDel.name}</b>? It is kept for old documents but no longer offered.</span>
          <button type="button" className="sb-abtn" onClick={() => setAskDel(null)} disabled={busy}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => doDelete(askDel)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      <div className="sb-list">
        <table className="sb-t px rmx">
          <colgroup><col style={{ width: '8%' }} /><col style={{ width: '24%' }} /><col style={{ width: '12%' }} /><col style={{ width: '6%' }} /><col style={{ width: '8%' }} /><col style={{ width: '6%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} /></colgroup>
          <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Unit</th><th>HSN</th><th className="r">GST</th><th className="r">Min level</th><th className="r">Opening qty</th><th className="r">Opening rate</th><th>Added by</th></tr></thead>
          <tbody>
            {rms === null ? <tr><td colSpan={10} className="sb-empty">Loading…</td></tr>
              : !list.length ? <tr><td colSpan={10} className="sb-empty">{q ? `Nothing matches “${q}”.` : 'No raw materials yet — click “Add Raw Material”.'}</td></tr>
                : list.map(r => (
                  <tr key={r.rmId} className={selId === r.rmId ? 'sel' : ''} onClick={() => setSelId(r.rmId)} onDoubleClick={() => onEdit(r)} style={{ cursor: 'pointer' }}>
                    <td className="b">{r.code}</td><td title={r.name}>{r.name}</td><td>{r.category || '—'}</td><td>{r.unit}</td><td>{r.hsnCode || '—'}</td>
                    <td className="r">{num(r.gstPercent)}%</td><td className="r">{r.minLevel ? num(r.minLevel) : '—'}</td>
                    <td className="r">{r.opening?.qty ? num(r.opening.qty) : '—'}</td><td className="r">{r.opening?.rate ? money(r.opening.rate) : '—'}</td>
                    <td>{r.createdBy || '—'}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Stock → Raw Material Stock ── */
export function RawStock() {
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};
  const [data, setData] = useState(null);
  const [slot, setSlot] = useState(null);
  const [q, setQ] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const get = (url, extra) => axios.get(url, { params: { companyId, ...extra } }).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
    Promise.all([get('/api/raw-materials'), get('/api/purchase-orders'), loadGrns(companyId), get('/api/bills', { type: 'purchase' })])
      .then(([rms, pos, grns, pbills]) => setData({ rms, pos, grns, pbills }));
  }, [companyId]);

  const rows = useMemo(() => {
    if (!data) return [];
    const stockPo = new Set(data.pos.filter(p => p.poType === 'Stock').map(p => String(p.orderId)));
    const match = (rm, it) => (it.itemCode && String(it.itemCode) === rm.code) || key(it.itemName || it.description) === key(rm.name);
    return data.rms.map(rm => {
      const oq = n(rm.opening?.qty), orate = n(rm.opening?.rate);
      let rec = 0, bq = 0, bv = 0, lastGrn = '';
      data.grns.filter(g => g.status !== 'deleted' && stockPo.has(String(g.poId))).forEach(g => (g.items || []).forEach(it => {
        if (match(rm, it)) { rec += grnQtyOf(it); if (String(g.receiptDate || '') > lastGrn) lastGrn = String(g.receiptDate || ''); }
      }));
      data.pbills.filter(billCounts).forEach(b => (b.items || []).forEach(li => {
        const po = li.poId != null && li.poId !== '' ? String(li.poId) : String(b.orderId || '');
        if (!(String(li.itemCode || '') === rm.code || (stockPo.has(po) && match(rm, li)))) return;
        bq += n(li.qty); bv += n(li.taxable) || n(li.qty) * n(li.rate);
      }));
      const avg = oq + bq > 0 ? (oq * orate + bv) / (oq + bq) : 0;
      const issued = 0, returned = 0;   // Job Card issue / return — next step
      const closing = r3(oq + rec - issued + returned);
      return { rm, opening: oq, rec: r3(rec), issued, returned, closing, avg: r2(avg), value: r2(closing * avg), low: n(rm.minLevel) > 0 && closing < n(rm.minLevel), lastGrn };
    });
  }, [data]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter(r => (!onlyLow || r.low) && (!words.length || words.every(x => `${r.rm.code} ${r.rm.name} ${r.rm.category}`.toLowerCase().includes(x))));
  const totVal = shown.reduce((s, r) => s + r.value, 0);
  const lowCount = rows.filter(r => r.low).length;
  const doPrint = () => printList({
    title: 'Raw Material Stock', company: selectedCompany, user,
    filter: [`As on ${fdate(new Date())}`, onlyLow && 'Below minimum only', q.trim() && `Search: ${q.trim()}`].filter(Boolean).join('  |  '),
    cols: [['Code', '', '7%'], ['Raw Material', '', '20%'], ['Unit', 'c', '5%'], ['Opening', 'r', '8%'], ['Received (GRN)', 'r', '9%'], ['Issued', 'r', '7%'], ['Returned', 'r', '7%'], ['Closing', 'r', '8%'], ['Min level', 'r', '7%'], ['Avg rate', 'r', '10%'], ['Value', 'r', '12%']],
    rows: shown.map(r => [esc(r.rm.code), esc(r.rm.name), esc(r.rm.unit), num(r.opening), num(r.rec), num(r.issued), num(r.returned), `<b>${num(r.closing)}</b>${r.low ? ' (LOW)' : ''}`,
      r.rm.minLevel ? num(r.rm.minLevel) : '—', money(r.avg), money(r.value)]),
    total: ['', '', '', '', '', '', '', '', '', 'Total', `<b>${money(totVal)}</b>`],
  });

  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + EXTRA_CSS}</style>
      <div className="sb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected className="sb-tab on">Raw Material Stock</button>
        <div className="sb-slot" ref={setSlot} />
      </div>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search code, raw material, category…" aria-label="Search raw material stock" />
        <div className="sb-tools">
          <label className="sb-picked" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={onlyLow} onChange={e => setOnlyLow(e.target.checked)} />Below minimum only{lowCount ? ` (${lowCount})` : ''}</label>
          <button type="button" className="sb-tbtn" disabled={!shown.length} onClick={doPrint}><Svg name="file" size={13} />Print</button>
        </div>
      </>, slot)}
      {!data ? <div className="sb-empty">Loading…</div> : (
        <div className="sb-list">
          <table className="sb-t px rmx">
            <colgroup><col style={{ width: '7%' }} /><col style={{ width: '19%' }} /><col style={{ width: '5%' }} /><col style={{ width: '8%' }} /><col style={{ width: '9%' }} /><col style={{ width: '7%' }} /><col style={{ width: '7%' }} /><col style={{ width: '8%' }} /><col style={{ width: '7%' }} /><col style={{ width: '10%' }} /><col style={{ width: '13%' }} /></colgroup>
            <thead><tr><th>Code</th><th>Raw Material</th><th>Unit</th><th className="r">Opening</th><th className="r">Received (GRN)</th><th className="r">Issued</th><th className="r">Returned</th><th className="r">Closing</th><th className="r">Min level</th><th className="r">Avg rate</th><th className="r">Value</th></tr></thead>
            <tbody>
              {!shown.length && <tr><td colSpan={11} className="sb-empty">{q || onlyLow ? 'Nothing matches.' : 'No raw materials yet — add them in Manufacturing → Raw Material.'}</td></tr>}
              {shown.map(r => (
                <tr key={r.rm.rmId} className={r.low ? 'low' : ''}>
                  <td className="b">{r.rm.code}</td><td title={r.rm.name}>{r.rm.name}{r.rm.category ? <span className="mut"> · {r.rm.category}</span> : null}</td><td>{r.rm.unit}</td>
                  <td className="r">{num(r.opening)}</td><td className="r" title={r.lastGrn ? `Last GRN ${fdate(r.lastGrn)}` : ''}>{num(r.rec)}</td>
                  <td className="r">{num(r.issued)}</td><td className="r">{num(r.returned)}</td>
                  <td className={`r ${r.low ? 'lowt' : 'b'}`} title={r.low ? 'Below the minimum level — order more' : ''}>{num(r.closing)}{r.low ? ' ▼' : ''}</td>
                  <td className="r">{r.rm.minLevel ? num(r.rm.minLevel) : '—'}</td><td className="r">{r.avg ? money(r.avg) : '—'}</td><td className="r b">{money(r.value)}</td>
                </tr>
              ))}
              {shown.length > 0 && <tr><td colSpan={10} className="r b">Total value</td><td className="r b">{money(totVal)}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
