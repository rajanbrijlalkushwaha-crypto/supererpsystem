/* Beta — Fixed assets & depreciation (/api/accounts/assets — the same records as the classic Asset page).
 * Register for a financial year: cost, opening WDV, additions, depreciation, closing WDV. Year-wise schedule
 * per asset. WDV or SLM at the rate given; half the rate in the year bought when used under 180 days.
 * The books (/api/books) post the purchase, the depreciation each 31-Mar and the sale / disposal. */
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../utils/permissions';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS } from './BetaSales';
import { PX_CSS } from './BetaPurchaseParts';
import { ACC_CSS, words, hit } from './BetaAccKit';
import { BK_CSS, useBooks, fyName, fyStartYear, today, dmy, amt, amtZ, r2, printReport, excel } from './BetaBooksLib';

/* Income-tax block rates (WDV) as the default for each category */
export const ASSET_CATS = [['Land', 0], ['Building', 10], ['Plant & Machinery', 15], ['Vehicle', 15], ['Furniture & Fittings', 10], ['Computer & Software', 40], ['Office Equipment', 15], ['Tools', 15], ['Mobile & Electronics', 15], ['Other', 15]];
const blank = () => ({ assetName: '', category: 'Plant & Machinery', date: today(), useFrom: '', purchaseAmount: '', method: 'WDV', depreciationRate: '15', salvage: '', paidFrom: 'purchase', invoiceNo: '', supplier: '', serialNo: '', location: '', description: '', status: 'active', disposedOn: '', saleAmount: '', receivedIn: 'cash' });

export default function BetaFixedAssets() {
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [reload, setReload] = useState(0);
  const { books, err } = useBooks(companyId, reload);
  const [slot, setSlot] = useState(null);
  const [fy, setFy] = useState(fyStartYear(today()));
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState(null);
  const [ask, setAsk] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canAdd = can(user, 'accAsset', 'create'), canEdit = can(user, 'accAsset', 'edit'), canDel = can(user, 'accAsset', 'delete');
  const fyKey = `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
  const assets = useMemo(() => (books?.assets || []).map(a => {
    const y = (a.schedule || []).find(s => s.fy === fyKey);
    const before = (a.schedule || []).filter(s => s.fy < fyKey);
    const gone = a.status === 'disposed' && a.disposedOn && fyStartYear(a.disposedOn) < fy;
    const notYet = a.date && fyStartYear(a.date) > fy;
    const lastC = before.length ? before[before.length - 1].closing : 0;
    return { ...a, y: y || (notYet || gone ? null : { opening: lastC, addition: 0, dep: 0, closing: lastC }), notYet, gone };
  }), [books, fyKey, fy]);
  const w = words(q);
  const list = assets.filter(a => !a.notYet && (!st || (st === 'disposed' ? a.status === 'disposed' : a.status !== 'disposed')) && hit(`${a.assetName} ${a.category} ${a.serialNo || ''} ${a.location || ''} ${a.supplier || ''}`, w))
    .sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.date).localeCompare(String(b.date)));
  const T = list.reduce((t, a) => ({ cost: t.cost + (Number(a.purchaseAmount) || 0), op: t.op + (a.y?.opening || 0), add: t.add + (a.y?.addition || 0), dep: t.dep + (a.y?.dep || 0), cl: t.cl + (a.y?.closing || 0) }), { cost: 0, op: 0, add: 0, dep: 0, cl: 0 });
  const selA = list.find(a => a.assetId === sel) || null;
  const fys = useMemo(() => { const s = new Set([fyStartYear(today())]); (books?.assets || []).forEach(a => (a.schedule || []).forEach(y => s.add(+y.fy.slice(0, 4)))); return [...s].sort((a, b) => b - a); }, [books]);
  const banks = books?.banks || [];
  const vendors = useMemo(() => Object.values(books?.L || {}).filter(l => l.kind === 'vendor').map(l => l.name).sort(), [books]);
  const save = async () => {
    const f = form;
    if (!f.assetName.trim() || !(Number(f.purchaseAmount) > 0) || !f.date) return setNote('Asset name, date bought and cost are needed.');
    if (f.status === 'disposed' && !f.disposedOn) return setNote('Give the date it was sold / disposed.');
    setBusy(true);
    try {
      const body = { ...f, assetName: f.assetName.trim(), purchaseAmount: r2(f.purchaseAmount), depreciationRate: String(Number(f.depreciationRate) || 0), saleAmount: f.saleAmount === '' ? '' : r2(f.saleAmount) };
      delete body.assetId; delete body.schedule; delete body.y; delete body.notYet; delete body.gone;
      if (f.assetId) await axios.put(`/api/accounts/assets/${f.assetId}`, body, { params: { companyId } });
      else await axios.post('/api/accounts/assets', body, { params: { companyId } });
      setNote(`${f.assetId ? 'Updated' : 'Added'} ${body.assetName}.`); setForm(null); setReload(x => x + 1);
    } catch (e) { setNote(e.response?.data?.error || 'Could not save.'); } finally { setBusy(false); }
  };
  const del = async a => {
    setBusy(true);
    try { await axios.delete(`/api/accounts/assets/${a.assetId}`, { params: { companyId } }); setAsk(null); setSel(null); setNote(`Deleted ${a.assetName}.`); setReload(x => x + 1); }
    catch (e) { setNote(e.response?.data?.error || 'Could not delete.'); } finally { setBusy(false); }
  };
  const heads = [['Asset', ''], ['Category', '90px'], ['Bought', '58px'], ['Cost', '76px', 'r'], ['Rate', '52px', 'c'], ['Opening WDV', '78px', 'r'], ['Additions', '74px', 'r'], ['Depreciation', '74px', 'r'], ['Closing WDV', '78px', 'r']];
  const rowCells = a => [a.assetName, a.category, dmy(a.date), amt(a.purchaseAmount), `${a.depreciationRate || 0}% ${a.method === 'SLM' ? 'SLM' : 'WDV'}`, amtZ(a.y?.opening), amtZ(a.y?.addition), amtZ(a.y?.dep), amt(a.y?.closing)];
  const fset = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const num = k => e => setForm(f => ({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') }));
  return (
    <div className="sb">
      <style>{SALES_CSS + PX_CSS + ACC_CSS + BK_CSS}</style>
      <div className="sb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true" className="sb-tab on">Fixed Assets{books && <span className="n">{list.length}</span>}</button>
        <div className="sb-slot" ref={setSlot} />
      </div>
      {slot && createPortal(<>
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search asset, category, serial, location…" aria-label="Search assets" />
        <select className="sb-search" style={{ width: 112 }} value={fy} onChange={e => setFy(+e.target.value)} aria-label="Financial year">{fys.map(y => <option key={y} value={y}>{fyName(y)}</option>)}</select>
        <select className="sb-search" style={{ width: 110 }} value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">All</option><option value="active">In use</option><option value="disposed">Sold / disposed</option></select>
        <div className="sb-tools">
          <span className="sb-picked">{selA ? <b>{selA.assetName}</b> : 'Select an asset'}</span>
          {canAdd && <button type="button" className="sb-tbtn" onClick={() => { setNote(''); setForm(blank()); }}><Svg name="plus" size={13} />Add asset</button>}
          {canEdit && <button type="button" className="sb-tbtn" disabled={!selA} onClick={() => { const { y, notYet, gone, schedule, ...rest } = selA; setForm({ ...blank(), ...rest, purchaseAmount: String(rest.purchaseAmount ?? ''), saleAmount: String(rest.saleAmount ?? '') }); }}><Svg name="settings" size={13} />Edit</button>}
          {canDel && <button type="button" className="sb-tbtn del" disabled={!selA} onClick={() => setAsk(selA)}><Svg name="x" size={13} />Delete</button>}
          <button type="button" className="sb-tbtn" disabled={!selA} onClick={() => printReport({ title: 'ASSET DEPRECIATION SCHEDULE', kv: [['Asset', selA.assetName], ['Category', selA.category], ['Cost', amt(selA.purchaseAmount)], ['Method', `${selA.depreciationRate || 0}% ${selA.method === 'SLM' ? 'SLM' : 'WDV'}`]], company: selectedCompany, user,
            heads: [['Year', ''], ['Opening WDV', '100px', 'r'], ['Additions', '100px', 'r'], ['Depreciation', '100px', 'r'], ['Closing WDV', '100px', 'r'], ['Note', '120px']],
            rows: (selA.schedule || []).map(y => ({ c: [y.fy, amtZ(y.opening), amtZ(y.addition), amtZ(y.dep), amt(y.closing), y.disposed ? 'Sold / disposed' : y.half ? 'Half rate (< 180 days)' : ''] })) })}><Svg name="file" size={13} />Schedule</button>
          <button type="button" className="sb-tbtn" onClick={() => printReport({ title: 'FIXED ASSET REGISTER', kv: [['Year', fyName(fy)], ['Assets', String(list.length)]], company: selectedCompany, user, landscape: true, heads,
            rows: [...list.map(a => ({ c: rowCells(a) })), { cls: 'tot', c: ['TOTAL', '', '', amt(T.cost), '', amt(T.op), amt(T.add), amt(T.dep), amt(T.cl)] }], note: 'WDV / SLM at the rate shown; half the rate in the year bought when used under 180 days.' })}><Svg name="file" size={13} />Print register</button>
          <button type="button" className="sb-tbtn" onClick={() => excel(`Fixed_Assets_${fyKey}`, [{ name: 'Register', widths: [34, 20, 12, 14, 12, 14, 14, 14, 14, 14, 16, 18], rows: [['Fixed asset register', fyName(fy)], [], ['Asset', 'Category', 'Bought', 'Cost', 'Rate / method', 'Opening WDV', 'Additions', 'Depreciation', 'Closing WDV', 'Status', 'Serial no.', 'Location'],
            ...list.map(a => [a.assetName, a.category, dmy(a.date), Number(a.purchaseAmount) || 0, `${a.depreciationRate || 0}% ${a.method || 'WDV'}`, a.y?.opening || 0, a.y?.addition || 0, a.y?.dep || 0, a.y?.closing || 0, a.status === 'disposed' ? 'Disposed' : 'In use', a.serialNo || '', a.location || '']), ['Total', '', '', r2(T.cost), '', r2(T.op), r2(T.add), r2(T.dep), r2(T.cl)]] }])}><Svg name="chart" size={13} />Excel</button>
        </div>
      </>, slot)}
      {(note || err) && <div className={`bk-info${/^(Added|Updated|Deleted)/.test(note) ? ' ok' : ''}`}>{note || err}</div>}
      {ask && <div className="sb-ask" role="alertdialog" aria-label="Confirm delete"><span><b>Delete {ask.assetName}</b>? Its purchase and depreciation entries leave the books too.</span>
        <button type="button" className="sb-abtn" onClick={() => setAsk(null)} disabled={busy}>Keep</button><button type="button" className="sb-abtn danger" onClick={() => del(ask)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button></div>}
      {form && (
        <div className="bk-form" role="form" aria-label="Asset">
          <label>Asset name<input value={form.assetName} onChange={fset('assetName')} autoFocus aria-label="Asset name" placeholder="e.g. Hydra crane 14 T" /></label>
          <label>Category<select value={form.category} onChange={e => { const c = ASSET_CATS.find(x => x[0] === e.target.value); setForm(f => ({ ...f, category: e.target.value, depreciationRate: c ? String(c[1]) : f.depreciationRate })); }} aria-label="Category">{ASSET_CATS.map(c => <option key={c[0]} value={c[0]}>{c[0]} ({c[1]}%)</option>)}{form.category && !ASSET_CATS.some(c => c[0] === form.category) && <option value={form.category}>{form.category}</option>}</select></label>
          <label>Date bought<input type="date" value={form.date} onChange={fset('date')} aria-label="Date bought" /></label>
          <label>Put to use on<input type="date" value={form.useFrom} onChange={fset('useFrom')} aria-label="Put to use on" title="Leave blank if the same as the date bought" /></label>
          <label>Cost ₹ (without GST)<input value={form.purchaseAmount} onChange={num('purchaseAmount')} inputMode="decimal" aria-label="Cost" /></label>
          <label>Method<select value={form.method} onChange={fset('method')} aria-label="Depreciation method"><option value="WDV">WDV (written-down value)</option><option value="SLM">SLM (straight line)</option></select></label>
          <label>Rate % per year<input value={form.depreciationRate} onChange={num('depreciationRate')} inputMode="decimal" aria-label="Depreciation rate" /></label>
          <label>Paid from / booked as<select value={form.paidFrom} onChange={fset('paidFrom')} aria-label="Paid from">
            <option value="purchase">Already in a purchase bill (move from Purchase)</option><option value="cash">Cash</option>
            {banks.map(b => <option key={b.bankId} value={`bank:${b.bankId}`}>{b.name}</option>)}
            {vendors.map(v => <option key={v} value={`vendor:${v}`}>Owed to {v}</option>)}<option value="capital">Brought in by owner (capital)</option></select></label>
          <label>Supplier<input value={form.supplier} onChange={fset('supplier')} aria-label="Supplier" /></label>
          <label>Invoice no.<input value={form.invoiceNo} onChange={fset('invoiceNo')} aria-label="Invoice no." /></label>
          <label>Serial / reg. no.<input value={form.serialNo} onChange={fset('serialNo')} aria-label="Serial no." /></label>
          <label>Location / site<input value={form.location} onChange={fset('location')} aria-label="Location" /></label>
          <label>Status<select value={form.status} onChange={fset('status')} aria-label="Status"><option value="active">In use</option><option value="disposed">Sold / disposed</option></select></label>
          {form.status === 'disposed' && <>
            <label>Sold / disposed on<input type="date" value={form.disposedOn} min={form.date} onChange={fset('disposedOn')} aria-label="Disposed on" /></label>
            <label>Sale value ₹<input value={form.saleAmount} onChange={num('saleAmount')} inputMode="decimal" aria-label="Sale value" /></label>
            <label>Received in<select value={form.receivedIn} onChange={fset('receivedIn')} aria-label="Received in"><option value="cash">Cash</option>{banks.map(b => <option key={b.bankId} value={`bank:${b.bankId}`}>{b.name}</option>)}</select></label>
          </>}
          <label style={{ gridColumn: 'span 2' }}>Notes<input value={form.description} onChange={fset('description')} aria-label="Notes" /></label>
          <div className="act"><button type="button" className="sb-abtn" onClick={() => setForm(null)} disabled={busy}>Cancel</button><button type="button" className="sb-abtn" style={{ background: '#03444f', color: '#fff' }} onClick={save} disabled={busy}>{busy ? 'Saving…' : form.assetId ? 'Save changes' : 'Add asset'}</button></div>
        </div>
      )}
      <div className="bk-bar"><div className="ac-sum">
        <div>Assets<b>{list.length}</b></div><div>Cost ₹<b>{amt(T.cost)}</b></div><div>Opening WDV ₹<b>{amt(T.op)}</b></div><div>Additions ₹<b>{amt(T.add)}</b></div>
        <div>Depreciation {fyName(fy)} ₹<b style={{ color: '#B42318' }}>{amt(T.dep)}</b></div><div>Closing WDV ₹<b>{amt(T.cl)}</b></div>
      </div></div>
      <div className="bk-wrap">
        {!books ? <div className="sb-empty" style={{ padding: 30 }}>Loading…</div> : (
          <table className="bk">
            <colgroup><col /><col style={{ width: 160 }} /><col style={{ width: 96 }} /><col style={{ width: 120 }} /><col style={{ width: 96 }} /><col style={{ width: 120 }} /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 120 }} /><col style={{ width: 110 }} /></colgroup>
            <thead><tr><th>Asset</th><th>Category</th><th>Bought</th><th className="r">Cost</th><th className="c">Rate</th><th className="r">Opening WDV</th><th className="r">Additions</th><th className="r">Depreciation</th><th className="r">Closing WDV</th><th>Status</th></tr></thead>
            <tbody>
              {list.map(a => (
                <React.Fragment key={a.assetId}>
                  <tr className={`l${sel === a.assetId ? ' sel' : ''}`} onClick={() => setSel(sel === a.assetId ? null : a.assetId)} onDoubleClick={() => canEdit && setForm({ ...blank(), ...a })}>
                    <td title={a.description}><b>{a.assetName}</b>{a.serialNo && <span className="mut"> · {a.serialNo}</span>}{a.location && <span className="mut"> · {a.location}</span>}</td>
                    <td>{a.category}</td><td>{dmy(a.date)}</td><td className="r">{amt(a.purchaseAmount)}</td><td className="c">{a.depreciationRate || 0}% {a.method === 'SLM' ? 'SLM' : 'WDV'}</td>
                    <td className="r">{amtZ(a.y?.opening)}</td><td className="r">{amtZ(a.y?.addition)}</td><td className="r neg">{amtZ(a.y?.dep)}</td><td className="r"><b>{amt(a.y?.closing)}</b></td>
                    <td>{a.status === 'disposed' ? `Sold ${dmy(a.disposedOn)}` : 'In use'}</td>
                  </tr>
                  {sel === a.assetId && (a.schedule || []).map(y => <tr key={y.fy} className="sub"><td style={{ paddingLeft: 26 }}>{fyName(+y.fy.slice(0, 4))}{y.half ? ' · half rate (< 180 days)' : ''}{y.disposed ? ' · sold / disposed' : ''}</td><td /><td /><td /><td /><td className="r">{amtZ(y.opening)}</td><td className="r">{amtZ(y.addition)}</td><td className="r">{amtZ(y.dep)}</td><td className="r">{amt(y.closing)}</td><td /></tr>)}
                </React.Fragment>))}
              {!list.length && <tr><td colSpan={10} className="sb-empty">{q || st ? 'Nothing matches.' : `No fixed asset in ${fyName(fy)}${canAdd ? ' — click “Add asset”.' : '.'}`}</td></tr>}
            </tbody>
            <tfoot><tr><td>Total — {list.length} assets</td><td /><td /><td className="r">{amt(T.cost)}</td><td /><td className="r">{amt(T.op)}</td><td className="r">{amt(T.add)}</td><td className="r">{amt(T.dep)}</td><td className="r">{amt(T.cl)}</td><td /></tr></tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
