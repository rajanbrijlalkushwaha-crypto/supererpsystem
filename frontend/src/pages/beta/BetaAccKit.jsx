/* Shared bits for the Beta Account pages (Journal, Debit / Credit Note, Expense, Ledger payment). */
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Svg } from '../../components/ui/Icon';
import { openPreview } from './printKit';

export const amt = v => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
export const today = () => new Date().toISOString().slice(0, 10);
export const words = q => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
export const hit = (text, w) => !w.length || w.every(x => String(text || '').toLowerCase().includes(x));

export const ACC_CSS = `
.acx td { white-space:normal; overflow-wrap:anywhere; line-height:1.35; } .acx td.d { white-space:nowrap; } .acx th { font-size:10.5px; white-space:normal; }
.acx .b { font-weight:700; } .acx .sm { display:block; font-size:11px; color:#667085; }
.acx tbody tr:hover td { background:#F0F7F8; }
.acx tbody tr.sel td { background:#D4EBEE !important; } .acx tbody tr.sel td:first-child { box-shadow:inset 3px 0 0 #03444f; }
.ac-pill { display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:700; white-space:nowrap; }
.ac-sum { display:flex; flex-wrap:wrap; background:#fff; border-bottom:1px solid #DCE6E8; flex-shrink:0; }
.ac-sum div { padding:7px 16px; border-right:1px solid #DCE6E8; font-size:11px; color:#667085; text-transform:uppercase; letter-spacing:.3px; }
.ac-sum b { display:block; font-size:15px; color:#03444f; text-transform:none; letter-spacing:0; }
.ac-seg { display:flex; gap:4px; padding:6px 10px; background:#fff; border-bottom:1px solid #DCE6E8; flex-shrink:0; flex-wrap:wrap; }
.ac-seg button { border:1px solid #C9D7DA; background:#fff; color:#03444f; font:600 12.5px Inter, Arial, sans-serif; padding:5px 14px; border-radius:99px; cursor:pointer; }
.ac-seg button.on { background:#03444f; border-color:#03444f; color:#fff; } .ac-seg button span { opacity:.75; margin-left:5px; font-weight:500; }
.ac-lines { width:100%; border-collapse:collapse; font-size:12.5px; }
.ac-lines th { background:#F4F8F8; border:1px solid #DCE6E8; padding:6px 8px; text-align:left; font-weight:600; color:#344054; }
.ac-lines td { border:1px solid #DCE6E8; padding:4px 6px; vertical-align:middle; }
.ac-lines td.r, .ac-lines th.r { text-align:right; } .ac-lines tfoot td { background:#F4F8F8; font-weight:700; }
.ac-lines input, .ac-lines select { width:100%; height:30px; border:1px solid #C9D7DA; border-radius:4px; padding:0 7px; font:12.5px Inter, Arial, sans-serif; box-sizing:border-box; background:#fff; }
.ac-lines input.num { text-align:right; }
.ac-x { border:0; background:none; color:#B42318; font-size:16px; cursor:pointer; padding:0 6px; } .ac-x:disabled { color:#D0D5DD; cursor:default; }
.ac-ta { width:100%; min-height:60px; padding:7px 9px; border:1px solid #C9D7DA; border-radius:4px; font:12.5px inherit; font-family:inherit; resize:vertical; box-sizing:border-box; }
.ac-docs { width:100%; border-collapse:collapse; } .ac-docs td { padding:6px 10px; font-size:12.5px; border-top:1px solid #EDF2F3; vertical-align:middle; }
.ac-bal { font-size:12px; font-weight:700; padding:3px 10px; border-radius:99px; }
.ac-pk { position:relative; } .ac-pk-list { position:absolute; left:0; right:0; top:calc(100% + 2px); z-index:60; background:#fff; border:1px solid #DCE6E8; border-radius:6px; box-shadow:0 10px 24px rgba(16,24,40,.16); max-height:260px; overflow:auto; }
.ac-pk-list .g { padding:4px 10px; font-size:10px; font-weight:800; color:#98A2B3; text-transform:uppercase; letter-spacing:.5px; background:#F9FAFB; position:sticky; top:0; }
.ac-pk-list button { display:block; width:100%; text-align:left; border:0; background:none; padding:6px 12px; font:12.5px Inter, Arial, sans-serif; cursor:pointer; color:#101828; }
.ac-pk-list button:hover, .ac-pk-list button.on { background:#F0F7F8; } .ac-pk-list button small { color:#667085; margin-left:6px; }
`;

export const PILL = {
  draft: ['#F2F4F7', '#475467', 'Draft'], posted: ['#ECFDF3', '#067647', 'Posted'], approved: ['#ECFDF3', '#067647', 'Approved'],
  confirmed: ['#ECFDF3', '#067647', 'Approved'], pending: ['#FFFAEB', '#B54708', 'Pending approval'], pending_approval: ['#FFFAEB', '#B54708', 'Pending approval'],
  rejected: ['#FEF3F2', '#B42318', 'Rejected'], cancelled: ['#F2F4F7', '#98A2B3', 'Cancelled'],
};
export const Pill = ({ s }) => { const [bg, fg, l] = PILL[s] || PILL.draft; return <span className="ac-pill" style={{ background: bg, color: fg }}>{PILL[s] ? l : (s || 'Draft')}</span>; };

/* type-to-search box over grouped options: groups = [{ group, items: [{ key, label, sub }] }] */
export function Picker({ value, onPick, groups, placeholder, autoFocus, ariaLabel }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const ref = useRef(null);
  useEffect(() => { setQ(value || ''); }, [value]);
  useEffect(() => {
    if (!open) return;
    const down = e => { if (!ref.current?.contains(e.target)) { setOpen(false); setQ(value || ''); } };
    document.addEventListener('mousedown', down); return () => document.removeEventListener('mousedown', down);
  }, [open, value]);
  const w = words(open ? q : '');
  const shown = groups.map(g => ({ ...g, items: g.items.filter(i => hit(`${i.label} ${i.sub || ''}`, w)).slice(0, 60) })).filter(g => g.items.length);
  const flat = shown.flatMap(g => g.items);
  const pick = i => { onPick(i); setQ(i.label); setOpen(false); };
  const key = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setIdx(x => Math.min(flat.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(x => Math.max(0, x - 1)); }
    else if (e.key === 'Enter' && open && flat[idx]) { e.preventDefault(); pick(flat[idx]); }
    else if (e.key === 'Escape') { setOpen(false); setQ(value || ''); }
  };
  return (
    <div className="ac-pk" ref={ref}>
      <input value={q} placeholder={placeholder} autoFocus={autoFocus} aria-label={ariaLabel} autoComplete="off"
        onFocus={() => { setOpen(true); setIdx(0); }} onChange={e => { setQ(e.target.value); setOpen(true); setIdx(0); }} onKeyDown={key} />
      {open && (
        <div className="ac-pk-list" role="listbox">
          {!flat.length ? <div className="g" style={{ position: 'static' }}>No match</div> : shown.map(g => (
            <React.Fragment key={g.group}>
              <div className="g">{g.group}</div>
              {g.items.map(i => <button key={`${g.group}-${i.key}`} type="button" role="option" aria-selected={flat[idx] === i} className={flat[idx] === i ? 'on' : ''} onMouseDown={e => { e.preventDefault(); pick(i); }}>{i.label}{i.sub && <small>{i.sub}</small>}</button>)}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/* attachments on journals / expenses (/api/accounts/{entity}s/:id/upload) — chosen in the form, uploaded on save */
export function AttachBox({ entity, rec, idKey, companyId, files, setFiles, onRemoved }) {
  const [err, setErr] = useState('');
  const inp = useRef(null);
  const saved = (rec && rec.attachments) || [];
  const base = rec ? `/api/accounts/${entity}s/${rec[idKey]}` : '';
  const add = e => {
    const list = [...(e.target.files || [])]; e.target.value = '';
    const bad = list.find(f => f.size > 20 * 1024 * 1024);
    if (bad) return setErr(`${bad.name} is over 20 MB.`);
    setErr(''); setFiles(fs => [...fs, ...list]);
  };
  const view = async a => {
    try {
      const r = await axios.get(`${base}/download/${encodeURIComponent(a.fileName)}`, { params: { companyId, inline: 1 }, responseType: 'blob' });
      const pdf = /\.pdf$/i.test(a.fileName || a.name || '');
      openPreview(a.name || a.fileName, { pdfUrl: URL.createObjectURL(new Blob([r.data], { type: pdf ? 'application/pdf' : (r.data.type || 'application/octet-stream') })), fileName: a.name || a.fileName });
    } catch { setErr('Could not open the file.'); }
  };
  const remove = async a => {
    if (!window.confirm(`Remove ${a.name || a.fileName}?`)) return;
    try { const r = await axios.delete(`${base}/docs/${encodeURIComponent(a.fileName)}`, { params: { companyId } }); onRemoved && onRemoved(r.data?.attachments || []); }
    catch { setErr('Could not remove the file.'); }
  };
  const kb = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <div className="sf-card">
      <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b style={{ whiteSpace: 'nowrap' }}>Documents (PDF / bill copy)</b><span className="grow" />
        <button type="button" className="sf-lnk" style={{ whiteSpace: 'nowrap' }} onClick={() => inp.current?.click()}>+ Attach file</button>
        <input ref={inp} type="file" multiple hidden accept=".pdf,image/*,.xlsx,.xls,.doc,.docx" onChange={add} /></div>
      {!saved.length && !files.length ? <div className="sf-empty">No document — “+ Attach file” (bill copy, PDF, photo). Files upload when you save.</div> : (
        <table className="ac-docs"><tbody>
          {saved.map(a => <tr key={a.fileName}><td>{a.name || a.fileName}</td><td style={{ width: 110, color: '#667085' }}>{a.size ? kb(a.size) : ''}</td>
            <td style={{ width: 130, textAlign: 'right' }}><button type="button" className="sf-lnk" onClick={() => view(a)}>View</button> <button type="button" className="sf-lnk" onClick={() => remove(a)}>Remove</button></td></tr>)}
          {files.map((f, i) => <tr key={`n${i}`}><td>{f.name}</td><td style={{ color: '#B54708' }}>{kb(f.size)} · on save</td>
            <td style={{ textAlign: 'right' }}><button type="button" className="sf-lnk" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}>Remove</button></td></tr>)}
        </tbody></table>
      )}
      {err && <div className="sf-msg err" style={{ margin: 8 }}>{err}</div>}
    </div>
  );
}
export async function uploadAttach(entity, id, files, companyId) {
  if (!files.length) return '';
  try { const fd = new FormData(); files.forEach(f => fd.append('files', f)); await axios.post(`/api/accounts/${entity}s/${id}/upload`, fd, { params: { companyId } }); return ` ${files.length} file${files.length === 1 ? '' : 's'} attached.`; }
  catch { return ' The files could not be uploaded — open it again and attach them.'; }
}

/* ledger names for journal lines / expense "by": clients, vendors and ledger accounts grouped */
export async function loadLedgerGroups(companyId) {
  const get = u => axios.get(u, { params: { companyId } }).then(r => (Array.isArray(r.data) ? r.data : [])).catch(() => []);
  const [acc, cl, ve] = await Promise.all([get('/api/ledger/accounts'), get('/api/clients'), get('/api/vendors')]);
  const groups = [];
  const byGroup = {};
  acc.forEach(a => { if (!a.name) return; const g = a.groupName || 'Ledger Accounts'; (byGroup[g] = byGroup[g] || []).push({ key: `L${a.id || a.name}`, label: a.name, sub: a.code || '', kind: 'ledger', raw: a }); });
  Object.keys(byGroup).sort().forEach(g => groups.push({ group: g, items: byGroup[g].sort((x, y) => x.label.localeCompare(y.label)) }));
  const cls = cl.map(c => ({ key: `C${c.clientId}`, label: c.clientName || c.companyName || '', sub: c.city || '', kind: 'client', raw: c })).filter(x => x.label).sort((x, y) => x.label.localeCompare(y.label));
  const ves = ve.map(v => ({ key: `V${v.vendorId}`, label: v.vendorName || v.companyName || '', sub: v.city || '', kind: 'vendor', raw: v })).filter(x => x.label).sort((x, y) => x.label.localeCompare(y.label));
  if (cls.length) groups.push({ group: 'Clients', items: cls });
  if (ves.length) groups.push({ group: 'Vendors', items: ves });
  return { groups, ledgers: acc, clients: cl, vendors: ve };
}
