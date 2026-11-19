/* Beta — Office Suite: letters (Word) and sheets (Excel) made inside the ERP and kept with an order / client.
 *   /beta/office              Documents — every letter and sheet, with its order and client; open, view PDF, delete
 *   /beta/office/word         Word — a letter on the company letterhead (Letter, Reminder Letter, Covering Letter, Notice, Blank)
 *   /beta/office/excel        Excel — a sheet with formulas (=SUM(A1:A5), =B2*C2 …), paste from Excel, import / export .xlsx
 *   /beta/office/letterheads  Letterheads — upload the letterhead PDF / picture once, set the writing margins
 * Save asks which order (or client, then order) the document is for. Make PDF draws it on the letterhead; Sign puts
 * your signature (My Profile → My signature) on the PDF. Server: /api/office. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS } from './BetaSales';
import { Picker, words, hit, ACC_CSS } from './BetaAccKit';
import { openPreview } from './printKit';

const TEAL = '#03444f';
const F = "'Inter', system-ui, sans-serif";
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmy = v => { const x = v ? new Date(v) : null; return x && !isNaN(x) ? `${String(x.getDate()).padStart(2, '0')}-${MON[x.getMonth()]}-${x.getFullYear()}` : ''; };
const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* the server's own message; else why it failed (no answer / old server without this page / file too big…) */
const errOf = (e, d) => {
  const r = e?.response;
  if (r?.data?.error) return r.data.error;
  if (!r) return `${d} The server did not answer — check the connection.`;
  if (r.status === 404) return `${d} The server does not have Office Suite yet — restart the ERP on the server (server-update.cmd / pm2-start.cmd).`;
  if (r.status === 413) return `${d} The file is too big for the server.`;
  if (r.status === 401) return `${d} Please sign in again.`;
  return `${d} (server answered ${r.status})`;
};
const blobErr = async (e, d) => { try { const t = await e?.response?.data?.text?.(); return JSON.parse(t).error || d; } catch { return errOf(e, d); } };
const AL = { l: [14, 10, 14, 10], c: [14, 10, 14, 10], r: [14, 10, 14, 10], j: [14, 14, 14, 14] };
const AlignIco = ({ a }) => (
  <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">{AL[a].map((w, i) => {
    const x = a === 'c' ? (16 - w) / 2 : a === 'r' ? 15 - w : 1;
    return <rect key={i} x={x} y={2 + i * 3.4} width={w} height="1.7" rx=".6" fill="currentColor" />;
  })}</svg>
);
const LETTER_TYPES = ['Letter', 'Reminder Letter', 'Covering Letter', 'Notice', 'Blank'];
const DEF_M = { top: 20, bottom: 20, left: 20, right: 20 };   // margins (mm) with no letterhead

const OF_CSS = `
.of-bar { display:flex; align-items:center; flex-wrap:wrap; gap:6px; padding:6px 8px; background:#F4F8F8; border-bottom:1px solid #C9DCDE; flex-shrink:0; }
.of-bar .sp { flex:1; }
.of-bar select, .of-bar input[type=text], .of-in { height:29px; padding:0 8px; border:1px solid #B9D0D3; border-radius:6px; background:#fff; font:500 12.5px ${F}; color:#101828; outline:none; }
.of-bar select:focus, .of-in:focus { border-color:${TEAL}; }
.of-ib { min-width:29px; height:29px; padding:0 7px; border:1px solid #B9D0D3; border-radius:6px; background:#fff; color:#101828; cursor:pointer; font:600 12.5px ${F}; display:inline-flex; align-items:center; justify-content:center; gap:4px; }
.of-ib:hover:not(:disabled) { border-color:${TEAL}; color:${TEAL}; } .of-ib.on { background:#E8F3F4; border-color:${TEAL}; color:${TEAL}; } .of-ib:disabled { opacity:.4; cursor:default; }
.of-ib.pri { background:${TEAL}; border-color:${TEAL}; color:#fff; } .of-ib.pri:hover:not(:disabled) { background:#02333b; color:#fff; }
.of-grp { display:flex; gap:3px; padding-right:6px; margin-right:2px; border-right:1px solid #C9DCDE; }
.of-link { display:flex; align-items:center; gap:6px; font-size:12px; color:#475467; padding:0 4px; }
.of-link b { color:${TEAL}; }
.of-state { font-size:11.5px; color:#667085; padding:0 6px; white-space:nowrap; } .of-state.ok { color:#067647; font-weight:600; } .of-state.dirty { color:#B54708; font-weight:600; }
.of-desk { flex:1; min-height:0; overflow:auto; background:#DDE5E7; padding:18px 0 40px; }
.of-page { position:relative; width:210mm; min-height:297mm; margin:0 auto; background:#fff; box-shadow:0 2px 10px rgba(16,24,40,.18); box-sizing:border-box;
  background-repeat:repeat-y; background-size:210mm 297mm; background-position:top left; }
.of-ed { outline:none; min-height:200px; font-family:Arial, Helvetica, sans-serif; font-size:11pt; line-height:1.45; color:#000; overflow-wrap:break-word; }
.of-ed p { margin:0 0 8px; } .of-ed table { border-collapse:collapse; width:100%; margin:4px 0 8px; } .of-ed td, .of-ed th { border:1px solid #000; padding:4px 6px; vertical-align:top; }
.of-ed ul, .of-ed ol { margin:0 0 8px 22px; } .of-ed hr { border:0; border-top:1px solid #000; margin:8px 0; }
.of-ed [data-sign] { min-height:18mm; }
.of-pgline { position:absolute; left:0; right:0; border-top:1px dashed #F04438; pointer-events:none; }
.of-pgline span { position:absolute; right:4px; top:-15px; font:600 9.5px ${F}; color:#F04438; background:#fff; padding:0 3px; }
.of-ov { position:fixed; inset:0; z-index:1800; background:rgba(2,24,28,.45); display:grid; place-items:center; font-family:${F}; }
.of-dlg { width:min(520px, calc(100vw - 32px)); background:#fff; border-radius:10px; box-shadow:0 20px 50px rgba(16,24,40,.3); overflow:visible; }
.of-dlg h3 { margin:0; padding:12px 16px; font-size:14.5px; color:#fff; background:${TEAL}; border-radius:10px 10px 0 0; }
.of-dlg .b { padding:14px 16px; display:grid; gap:10px; font-size:12.5px; }
.of-dlg label.f { display:grid; gap:4px; font-weight:600; color:#344054; }
.of-dlg .seg { display:flex; gap:6px; } .of-dlg .seg button { flex:1; height:30px; border:1px solid #B9D0D3; border-radius:6px; background:#fff; cursor:pointer; font:600 12px ${F}; color:#344054; }
.of-dlg .seg button.on { background:#E8F3F4; border-color:${TEAL}; color:${TEAL}; }
.of-dlg .ac-pk input, .of-dlg .of-in { width:100%; box-sizing:border-box; height:32px; padding:0 8px; border:1px solid #B9D0D3; border-radius:6px; font:500 12.5px ${F}; outline:none; }
.of-dlg .ft { display:flex; justify-content:flex-end; gap:8px; padding:10px 16px 14px; }
.of-dlg .er { color:#B42318; font-weight:600; } .of-dlg .hint { color:#667085; font-weight:400; font-size:11.5px; }
.of-link .ac-pk { min-width:220px; } .of-link .ac-pk input { width:100%; box-sizing:border-box; height:29px; padding:0 8px; border:1px solid #B9D0D3; border-radius:6px; font:500 12.5px ${F}; outline:none; }

.of-tools { background:#fff; padding:5px 8px; gap:4px; }
.of-tools select { height:29px; } .of-tools select.fnt { width:150px; } .of-tools select.sz { width:62px; } .of-tools select.nf { width:118px; }
.of-ib.w { padding:0 10px; } .of-ib sup, .of-ib sub { font-size:8px; }
.of-ctx { background:#F0F7F7; padding:5px 8px; gap:4px; } .of-ctx > b { font-size:11.5px; color:${TEAL}; text-transform:uppercase; letter-spacing:.5px; margin-right:4px; }
.of-find .of-in { width:200px; }
.of-ia { display:inline-block; font:700 13px Georgia, serif; line-height:1; }
.of-ia.hl { font:700 11px ${F}; padding:0 2px; } .of-ia.fill, .of-ia.cell { font:400 14px ${F}; }
.of-x { font-size:9px; color:#B42318; margin-left:-2px; vertical-align:sub; }
.of-dd { position:relative; display:inline-flex; }
.of-dd .cv { font-size:9px; margin-left:3px; color:#667085; }
.of-cm .of-cb { border-radius:6px 0 0 6px; flex-direction:column; gap:0; padding:2px 6px 3px; }
.of-cm .of-cb i { display:block; width:16px; height:4px; margin-top:1px; border:1px solid rgba(0,0,0,.15); }
.of-cm .of-ca { border-radius:0 6px 6px 0; border-left:0; min-width:16px; padding:0 3px; font-size:9px; }
.of-pop { position:absolute; top:calc(100% + 3px); left:0; z-index:80; background:#fff; border:1px solid #D0D5DD; border-radius:8px; box-shadow:0 12px 30px rgba(16,24,40,.2); padding:6px; font-family:${F}; }
.of-pal { width:236px; } .of-pal small { display:block; font-size:10.5px; font-weight:700; color:#667085; margin:6px 2px 4px; }
.of-pal .g { display:grid; grid-template-columns:repeat(10, 1fr); gap:3px; }
.of-pal .g button { width:19px; height:17px; border:1px solid rgba(0,0,0,.18); border-radius:2px; cursor:pointer; padding:0; } .of-pal .g button:hover { outline:2px solid #F79009; outline-offset:1px; }
.of-pal .g button.t { margin-bottom:3px; }
.of-pal .of-none { width:100%; height:28px; border:1px solid #D0D5DD; border-radius:5px; background:#F9FAFB; cursor:pointer; font:600 12px ${F}; }
.of-pal .more { display:flex; align-items:center; gap:6px; margin-top:8px; padding-top:6px; border-top:1px solid #EDF2F3; font-size:12px; color:#344054; }
.of-pal .more span { flex:1; } .of-pal .more input { width:34px; height:26px; border:1px solid #D0D5DD; border-radius:4px; padding:0; background:#fff; cursor:pointer; }
.of-menu { min-width:190px; max-height:420px; overflow-y:auto; padding:4px; } .of-menu.wide { min-width:300px; }
.of-menu button { display:flex; align-items:baseline; justify-content:space-between; gap:12px; width:100%; padding:6px 10px; border:0; border-radius:5px; background:none; cursor:pointer; text-align:left; font:500 12.5px ${F}; color:#101828; white-space:nowrap; }
.of-menu button:hover:not(:disabled), .of-menu button.on { background:#F0F7F7; color:${TEAL}; } .of-menu button:disabled { opacity:.4; cursor:default; }
.of-menu button small { font-size:11px; color:#667085; } .of-menu hr { border:0; border-top:1px solid #EDF2F3; margin:4px 0; }
.of-ctxm { position:fixed; z-index:1900; }
.of-tg { padding:4px; } .of-tg .g { display:grid; grid-template-columns:repeat(10, 16px); gap:2px; }
.of-tg .g button { width:16px; height:16px; border:1px solid #C9D2D5; background:#fff; padding:0; cursor:pointer; } .of-tg .g button.on { background:#D4EBEE; border-color:${TEAL}; }
.of-tg small { display:block; text-align:center; font-size:11.5px; color:#344054; margin-top:5px; }
.of-sym { display:grid; grid-template-columns:repeat(8, 30px); gap:3px; }
.of-sym button { height:30px; border:1px solid #E1E6E8; border-radius:4px; background:#fff; cursor:pointer; font:15px Arial, sans-serif; } .of-sym button:hover { background:#F0F7F7; border-color:${TEAL}; }
.of-status { display:flex; align-items:center; gap:14px; height:26px; padding:0 12px; background:#F4F8F8; border-top:1px solid #C9DCDE; font-size:11.5px; color:#475467; flex-shrink:0; }
.of-status .sp { flex:1; } .of-status b { color:#101828; } .of-status select { height:21px; border:1px solid #B9D0D3; border-radius:4px; font:500 11.5px ${F}; margin-left:4px; }
.of-ed h1 { font-size:20pt; margin:0 0 10px; } .of-ed h2 { font-size:15pt; margin:0 0 8px; } .of-ed h3 { font-size:13pt; margin:0 0 6px; } .of-ed h4 { font-size:11.5pt; margin:0 0 6px; }
.of-ed blockquote { margin:0 0 8px 10mm; padding-left:4mm; border-left:3px solid #999; font-style:italic; }
.of-ed a { color:#0563C1; } .of-ed img { max-width:100%; cursor:pointer; } .of-ed img.of-isel { outline:2px solid #2E90FA; outline-offset:2px; }
.of-ed table.nb td, .of-ed table.nb th { border:1px dashed #D0D5DD; }
.of-ed .pgb { height:0; border-top:2px dashed #2E90FA; margin:10px 0; position:relative; } .of-ed .pgb::after { content:'Page break'; position:absolute; right:0; top:-9px; font:600 9px ${F}; color:#2E90FA; background:#fff; padding:0 4px; }

.of-xl { flex:1; min-height:0; overflow:auto; background:#fff; outline:none; }
.of-xl table { border-collapse:collapse; table-layout:fixed; font:400 12.5px Arial, Helvetica, sans-serif; }
.of-xl th { position:sticky; top:0; z-index:2; background:#EEF2F3; color:#475467; font:600 11px ${F}; height:22px; border:1px solid #C9D2D5; user-select:none; cursor:s-resize; }
.of-xl th.ch { position:sticky; } .of-xl th .rz { position:absolute; right:-3px; top:0; bottom:0; width:6px; cursor:col-resize; z-index:3; }
.of-xl th.rh { left:0; z-index:4; width:44px; cursor:se-resize; }
.of-xl td.rh { position:sticky; left:0; z-index:1; background:#EEF2F3; color:#475467; font:600 11px ${F}; text-align:center; border:1px solid #C9D2D5; user-select:none; cursor:e-resize; }
.of-xl td.rh .rzh { position:absolute; left:0; right:0; bottom:-3px; height:6px; cursor:row-resize; z-index:2; } .of-xl td.rh { position:sticky; }
.of-xl td.c { height:22px; padding:0 4px; border:1px solid #E1E6E8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:cell; user-select:none; vertical-align:bottom; }
.of-xl td.c.wr { white-space:normal; overflow-wrap:anywhere; }
.of-xl td.c.rg { box-shadow:inset 0 0 0 999px rgba(3,68,79,.13); }
.of-xl td.c.sel { outline:2px solid ${TEAL}; outline-offset:-2px; box-shadow:inset 0 0 0 999px rgba(3,68,79,.05); } .of-xl td.c.er { color:#B42318; }
.of-xl td.c input { width:100%; height:20px; border:0; outline:none; font:inherit; padding:0; background:transparent; color:inherit; text-align:inherit; }
.of-xl th.ch.on, .of-xl td.rh.on { background:#D4EBEE; color:${TEAL}; }
.of-fx { display:flex; align-items:center; gap:6px; padding:4px 8px; border-bottom:1px solid #C9DCDE; background:#fff; flex-shrink:0; }
.of-fx b { min-width:56px; padding:4px 6px; text-align:center; font:700 12px ui-monospace, Consolas, monospace; color:${TEAL}; border:1px solid #B9D0D3; border-radius:4px; }
.of-fx .fx { font:italic 700 13px Georgia, serif; color:#667085; }
.of-fx input { flex:1; height:26px; border:1px solid #B9D0D3; border-radius:4px; padding:0 8px; font:400 12.5px ui-monospace, Consolas, monospace; outline:none; }
.of-fx input:focus { border-color:${TEAL}; }

.of-lh { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:14px; padding:14px; }
.of-lhc { background:#fff; border:1px solid #C9DCDE; border-radius:8px; overflow:hidden; display:flex; flex-direction:column; }
.of-lhc img { width:100%; aspect-ratio:210/297; object-fit:cover; border-bottom:1px solid #EDF2F3; background:#F4F8F8; }
.of-lhc .b { padding:8px 10px; display:grid; gap:6px; font-size:12px; }
.of-lhc .m { display:grid; grid-template-columns:repeat(4, 1fr); gap:4px; } .of-lhc .m label { display:grid; gap:2px; font-size:10.5px; color:#667085; font-weight:600; }
.of-lhc .m input { width:100%; box-sizing:border-box; height:26px; border:1px solid #B9D0D3; border-radius:4px; padding:0 4px; font:500 12px ${F}; }
.of-lhc .r { display:flex; gap:6px; }
.of-kd { display:inline-grid; place-items:center; width:20px; height:20px; border-radius:4px; color:#fff; font:700 10.5px ${F}; }
.of-sp { position:fixed; inset:0; z-index:1750; background:rgba(2,24,28,.82); display:flex; flex-direction:column; font-family:${F}; touch-action:none; }
.of-sph { display:flex; align-items:center; gap:10px; padding:8px 14px; background:#fff; border-bottom:1px solid #C9DCDE; font-size:12.5px; color:#475467; flex-wrap:wrap; }
.of-sph b { color:${TEAL}; font-size:14px; } .of-sph .grow { flex:1; }
.of-spn { display:flex; align-items:center; gap:6px; font-weight:600; color:#344054; cursor:pointer; } .of-spn input { accent-color:${TEAL}; }
.of-spb { flex:1; overflow:auto; padding:20px 0 60px; display:flex; flex-direction:column; align-items:center; gap:18px; }
.of-spp { position:relative; width:min(820px, calc(100vw - 32px)); background:#fff; box-shadow:0 4px 18px rgba(0,0,0,.4); cursor:crosshair; user-select:none; }
.of-spp > img { width:100%; height:100%; display:block; }
.of-spno { position:absolute; right:8px; bottom:-17px; color:#fff; font-size:11px; }
.of-sig { position:absolute; cursor:move; outline:2px dashed #F04438; outline-offset:2px; background:rgba(255,255,255,.15); touch-action:none; }
.of-sig img { width:100%; display:block; pointer-events:none; }
.of-sig small { position:absolute; left:0; right:0; top:100%; text-align:center; font:8px Arial, sans-serif; color:#000; }
.of-sz { position:absolute; right:-7px; bottom:-7px; width:13px; height:13px; background:#F04438; border:2px solid #fff; border-radius:50%; cursor:nwse-resize; }
`;

/* ───────── save dialog: the order (or the client, then the order) ───────── */
function SaveDialog({ init, orders, clients, onCancel, onSave, busy, err }) {
  const [title, setTitle] = useState(init.title || '');
  const [by, setBy] = useState(init.clientName && !init.orderNo ? 'client' : 'order');
  const [order, setOrder] = useState(init.orderNo ? { orderId: init.orderId, orderNo: init.orderNo, clientId: init.clientId, clientName: init.clientName } : null);
  const [client, setClient] = useState(init.clientName ? { clientId: init.clientId, clientName: init.clientName } : null);
  const orderItems = list => list.map(o => ({ key: o.orderId, label: String(o.orderNo || '').trim(), sub: [o.customerName || o.party, o.customerPO && `PO ${o.customerPO}`, dmy(o.orderDate)].filter(Boolean).join(' · '), o }));
  const clientOrders = client ? orders.filter(o => (client.clientId && String(o.customerCode) === String(client.clientId)) || String(o.customerName || o.party || '').trim().toLowerCase() === String(client.clientName).trim().toLowerCase()) : [];
  const ok = title.trim() && (by === 'order' ? !!order : !!client);
  const save = () => {
    if (!ok) return;
    const link = by === 'order' || order
      ? { orderId: order?.orderId || '', orderNo: order?.orderNo || '', clientId: order?.clientId || client?.clientId || '', clientName: order?.clientName || client?.clientName || '' }
      : { orderId: '', orderNo: '', clientId: client.clientId || '', clientName: client.clientName };
    onSave({ title: title.trim(), ...link });
  };
  const pickOrder = o => setOrder({ orderId: String(o.orderId), orderNo: String(o.orderNo || '').trim(), clientId: String(o.customerCode || ''), clientName: o.customerName || o.party || '' });
  return createPortal(
    <div className="of-ov" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="of-dlg" role="dialog" aria-modal="true" aria-label="Save document" onKeyDown={e => { if (e.key === 'Escape' && !busy) onCancel(); }}>
        <h3>Save — which order is this for?</h3>
        <div className="b">
          <label className="f">Document name<input className="of-in" value={title} onChange={e => setTitle(e.target.value)} autoFocus placeholder="e.g. Payment reminder letter" /></label>
          <div className="seg" role="radiogroup" aria-label="Find by">
            <button type="button" className={by === 'order' ? 'on' : ''} onClick={() => setBy('order')}>By Order No.</button>
            <button type="button" className={by === 'client' ? 'on' : ''} onClick={() => setBy('client')}>By Client, then Order</button>
          </div>
          {by === 'order' ? (
            <label className="f">Order No.
              <Picker value={order ? `${order.orderNo}` : ''} placeholder="Type the order no. or client…" ariaLabel="Order"
                groups={[{ group: 'Sales orders', items: orderItems(orders) }]} onPick={i => pickOrder(i.o)} />
              {order && <span className="hint">Client: <b>{order.clientName}</b></span>}
            </label>
          ) : (<>
            <label className="f">Client
              <Picker value={client ? client.clientName : ''} placeholder="Type the client name…" ariaLabel="Client"
                groups={[{ group: 'Clients', items: clients.map(c => ({ key: c.clientId, label: c.companyName || c.clientName, sub: [c.city, c.state].filter(Boolean).join(', '), c })) }]}
                onPick={i => { setClient({ clientId: String(i.c.clientId), clientName: i.c.companyName || i.c.clientName }); setOrder(null); }} />
            </label>
            {client && (
              <label className="f">Order <span className="hint">({clientOrders.length ? `${clientOrders.length} order${clientOrders.length > 1 ? 's' : ''} of this client — or leave empty for a client letter` : 'this client has no order — the document is kept with the client'})</span>
                {!!clientOrders.length && <Picker value={order ? order.orderNo : ''} placeholder="Choose the order (optional)" ariaLabel="Order of the client"
                  groups={[{ group: client.clientName, items: orderItems(clientOrders) }]} onPick={i => pickOrder(i.o)} />}
              </label>
            )}
          </>)}
          {err && <div className="er">{err}</div>}
        </div>
        <div className="ft">
          <button type="button" className="of-ib" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="of-ib pri" onClick={save} disabled={!ok || busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>, document.body);
}

/* ───────── shared: save, PDF, sign ───────── */
function useDocActions({ companyId, kind, onSaved }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const save = async payload => {
    setBusy('save'); setErr('');
    try { const r = await axios.post('/api/office/docs', { companyId, kind, ...payload }); onSaved(r.data); return r.data; }
    catch (e) { setErr(errOf(e, 'Could not save.')); return null; } finally { setBusy(''); }
  };
  const show = (doc, blob, signed) => openPreview(`${doc.title}${signed ? ' (signed)' : ''}`, { pdfUrl: URL.createObjectURL(blob), fileName: `${[doc.clientName, doc.title].filter(Boolean).join(' - ')}.pdf` });
  const refresh = async doc => { const fresh = await axios.get(`/api/office/docs/${doc.docId}`, { params: { companyId } }); onSaved(fresh.data, true); };
  const pdf = async (doc, html) => {
    setBusy('pdf'); setErr('');
    try {
      const r = await axios.post(`/api/office/docs/${doc.docId}/pdf`, { companyId, html }, { responseType: 'blob' });
      show(doc, new Blob([r.data], { type: 'application/pdf' }));
      await refresh(doc);
    } catch (e) { setErr(await blobErr(e, 'Could not make the PDF.')); } finally { setBusy(''); }
  };
  const signed = async (doc, blob) => { show(doc, blob, true); await refresh(doc).catch(() => {}); };
  return { busy, err, setErr, save, pdf, signed };
}


/* the PDF page: the same look as the editor, margins of the letterhead; the letterhead itself is drawn by the server */
const DOC_CSS = `
p { margin:0 0 8px; } table { border-collapse:collapse; } ul, ol { margin:0 0 8px 22px; } hr { border:0; border-top:1px solid #000; margin:8px 0; }
h1 { font-size:20pt; margin:0 0 10px; } h2 { font-size:15pt; margin:0 0 8px; } h3 { font-size:13pt; margin:0 0 6px; } h4 { font-size:11.5pt; margin:0 0 6px; }
blockquote { margin:0 0 8px 10mm; padding-left:4mm; border-left:3px solid #999; font-style:italic; }
a { color:#0563C1; } img { max-width:100%; }
.lt table { width:100%; margin:4px 0 8px; } .lt td, .lt th { border:1px solid #000; padding:4px 6px; vertical-align:top; } .lt table.nb td, .lt table.nb th { border:0; }
.pgb { break-after:page; page-break-after:always; height:0; }`;
const pageHtml = (body, m, { landscape, title } = {}) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title || '')}</title><style>
@page { size:A4 ${landscape ? 'landscape' : 'portrait'}; margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }
html, body { margin:0; padding:0; background:transparent; }
body { font-family:Arial, Helvetica, sans-serif; font-size:11pt; line-height:1.45; color:#000; overflow-wrap:break-word; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
${DOC_CSS}
[data-sign] img { height:18mm; display:block; }
.xh { display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin:0 0 6px; font-size:11pt; } .xh span { font-size:9pt; }
.xs { width:calc(100% - 1px); box-sizing:border-box; table-layout:fixed; font-size:9.5pt; line-height:1.3; } .xs td { height:13pt; padding:2px 4px; vertical-align:bottom; white-space:nowrap; overflow:hidden; }
.xs.g td { border:0.6pt solid #000; }
</style></head><body>${body}</body></html>`;

/* ───────── Sign: show the PDF pages, the user drags the signature where it should go ───────── */
let pdfjsP = null;
function loadPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsP) {
    pdfjsP = (async () => {
      const get = async f => URL.createObjectURL(new Blob([(await axios.get(`/api/office/pdfjs/${f}`, { responseType: 'text', transformResponse: x => x })).data], { type: 'text/javascript' }));
      const [lib, worker] = await Promise.all([get('pdf.min.js'), get('pdf.worker.min.js')]);
      await new Promise((ok, bad) => { const sc = document.createElement('script'); sc.src = lib; sc.onload = ok; sc.onerror = bad; document.head.appendChild(sc); });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
      return window.pdfjsLib;
    })().catch(e => { pdfjsP = null; throw e; });
  }
  return pdfjsP;
}

function SignPlacer({ doc, companyId, onClose, onSigned }) {
  const [pages, setPages] = useState(null);       // [{ url, ratio }]
  const [sig, setSig] = useState(null);           // { url, ratio } ratio = height / width
  const [pos, setPos] = useState(null);           // { page, x, y, w } fractions of the page
  const [withName, setWithName] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const refs = useRef([]);
  const drag = useRef(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const r = await axios.get('/api/sign/my');
        if (!r.data?.has) { setErr('Save your signature first: My Profile → My signature.'); return; }
        const im = new Image(); im.src = r.data.dataUrl; await im.decode();
        if (!dead) setSig({ url: r.data.dataUrl, ratio: im.naturalHeight / im.naturalWidth, name: r.data.name || '' });
        const lib = await loadPdfjs();
        const raw = await axios.get(`/api/office/docs/${doc.docId}/pdf`, { params: { companyId, base: 1 }, responseType: 'arraybuffer' });
        const pdf = await lib.getDocument({ data: new Uint8Array(raw.data) }).promise;
        const list = [];
        for (let i = 1; i <= pdf.numPages; i += 1) {
          const pg = await pdf.getPage(i);
          const v1 = pg.getViewport({ scale: 1 });
          const vp = pg.getViewport({ scale: 1400 / v1.width });
          const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
          await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          list.push({ url: c.toDataURL('image/png'), ratio: v1.height / v1.width });
        }
        if (dead) return;
        setPages(list);
        // start where it was signed before, else bottom-left part of the last page
        const s0 = doc.sign && doc.sign.page < list.length ? doc.sign : { page: list.length - 1, x: 0.1, y: 0.72, w: 0.2 };
        setWithName(!!doc.sign?.withName);
        setPos({ page: s0.page, x: s0.x, y: s0.y, w: s0.w });
      } catch (e) { if (!dead) setErr(errOf(e, 'Could not open the PDF.')); }
    })();
    return () => { dead = true; };
  }, [doc.docId, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const pageAt = (cx, cy) => refs.current.findIndex(el => { if (!el) return false; const r = el.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom; });
  const hFrac = (p, w) => (sig ? (w * sig.ratio) / pages[p].ratio : 0.05);
  const clamp = (p, x, y, w) => ({ page: p, w, x: Math.min(1 - w, Math.max(0, x)), y: Math.min(1 - hFrac(p, w), Math.max(0, y)) });
  const down = (e, mode) => {
    e.preventDefault(); e.stopPropagation();
    const r = refs.current[pos.page].getBoundingClientRect();
    drag.current = { mode, sx: e.clientX, sy: e.clientY, start: pos, dx: e.clientX - (r.left + pos.x * r.width), dy: e.clientY - (r.top + pos.y * r.height) };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = e => {
    const d = drag.current; if (!d) return;
    if (d.mode === 'size') {
      const r = refs.current[d.start.page].getBoundingClientRect();
      const w = Math.min(0.9, Math.max(0.05, d.start.w + (e.clientX - d.sx) / r.width));
      setPos(clamp(d.start.page, d.start.x, d.start.y, w));
      return;
    }
    const p = pageAt(e.clientX, e.clientY); if (p < 0) return;
    const r = refs.current[p].getBoundingClientRect();
    setPos(clamp(p, (e.clientX - d.dx - r.left) / r.width, (e.clientY - d.dy - r.top) / r.height, d.start.w));
  };
  const up = () => { drag.current = null; };
  const clickPage = (e, p) => {
    if (drag.current || !pos) return;
    const r = refs.current[p].getBoundingClientRect();
    const w = pos.w; const hf = hFrac(p, w);
    setPos(clamp(p, (e.clientX - r.left) / r.width - w / 2, (e.clientY - r.top) / r.height - hf / 2, w));
  };
  const sign = async () => {
    setBusy(true); setErr('');
    try {
      const r = await axios.post(`/api/office/docs/${doc.docId}/sign`, { companyId, ...pos, withName }, { responseType: 'blob' });
      onSigned(new Blob([r.data], { type: 'application/pdf' }));
    } catch (e) { setErr(await blobErr(e, 'Could not sign.')); setBusy(false); }
  };
  return createPortal(
    <div className="of-sp" onPointerMove={move} onPointerUp={up} role="dialog" aria-modal="true" aria-label="Place your signature">
      <div className="of-sph">
        <b>Place your signature</b>
        <span>Click on the page where it should go, drag it to adjust, pull the corner to make it bigger or smaller.</span>
        <span className="grow" />
        <label className="of-spn"><input type="checkbox" checked={withName} onChange={e => setWithName(e.target.checked)} /> Name &amp; date below</label>
        <button type="button" className="of-ib" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="of-ib pri" onClick={sign} disabled={!pos || busy}>{busy ? 'Signing…' : '✍ Sign here'}</button>
      </div>
      {err && <div className="sb-ask"><span>{err}</span><button type="button" className="sb-abtn" onClick={onClose}>Close</button></div>}
      <div className="of-spb">
        {!pages && !err && <div className="sb-empty" style={{ color: '#fff' }}>Opening the PDF…</div>}
        {pages && pages.map((pg, i) => (
          <div key={i} className="of-spp" ref={el => { refs.current[i] = el; }} style={{ aspectRatio: `1 / ${pg.ratio}` }} onClick={e => clickPage(e, i)}>
            <img src={pg.url} alt={`Page ${i + 1}`} draggable={false} />
            <span className="of-spno">Page {i + 1} of {pages.length}</span>
            {pos && sig && pos.page === i && (
              <div className="of-sig" style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, width: `${pos.w * 100}%` }} onPointerDown={e => down(e, 'move')} onClick={e => e.stopPropagation()}>
                <img src={sig.url} alt="Your signature" draggable={false} />
                {withName && <small>{sig.name}</small>}
                <i className="of-sz" onPointerDown={e => down(e, 'size')} aria-label="Resize" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>, document.body);
}

/* ───────── Word ───────── */
function letterTemplate(type, { co, order, client, by }) {
  const date = dmy(new Date());
  const cName = esc(order?.customerName || order?.party || client?.companyName || client?.clientName || '');
  const cAddr = esc([order?.address || client?.billingAddr || client?.address, [order?.customerCity || client?.city, order?.customerState || client?.state, order?.customerPincode || client?.pincode].filter(Boolean).join(', ')].filter(Boolean).join('\n')).replace(/\n/g, '<br>');
  const oNo = esc(String(order?.orderNo || '').trim());
  const po = esc(order?.customerPO || '');
  const coName = esc(co?.companyName || co?.name || '');
  const to = `<p>To,<br><b>${cName || '[Client name]'}</b>${cAddr ? `<br>${cAddr}` : '<br>[Address]'}</p>`;
  const sign = `<p>Thanking you,<br>Yours faithfully,<br>For <b>${coName}</b></p><p><br></p><p><br></p><p><b>Authorised Signatory</b>${by ? `<br>${esc(by)}` : ''}</p>`;
  const ref = `<table style="width:100%;border:0;margin:0 0 10px"><tbody><tr><td style="border:0;padding:0">Ref: ${oNo ? `${coName ? '' : ''}${oNo}` : '__________'}</td><td style="border:0;padding:0;text-align:right">Date: ${date}</td></tr></tbody></table>`;
  const poLine = po ? ` against your Purchase Order No. <b>${po}</b>${order?.poDate ? ` dated ${dmy(order.poDate)}` : ''}` : '';
  switch (type) {
    case 'Reminder Letter':
      return `${ref}${to}<p><b>Subject: Reminder for pending payment${oNo ? ` — Our Order No. ${oNo}` : ''}</b></p><p>Dear Sir / Madam,</p>
<p>This is a gentle reminder that the payment for the supply made${poLine} is still pending with you. The details are given below:</p>
<table><tbody><tr><td><b>Invoice No. / Date</b></td><td>&nbsp;</td></tr><tr><td><b>Invoice Amount (₹)</b></td><td>&nbsp;</td></tr><tr><td><b>Amount Received (₹)</b></td><td>&nbsp;</td></tr><tr><td><b>Balance Due (₹)</b></td><td>&nbsp;</td></tr></tbody></table>
<p>We request you to kindly release the pending amount at the earliest. If the payment has already been made, please share the payment details so that we can update our records.</p>${sign}`;
    case 'Covering Letter':
      return `${ref}${to}<p><b>Subject: Submission of documents${po ? ` against your PO No. ${po}` : ''}</b></p><p>Dear Sir / Madam,</p>
<p>With reference to the above subject, we are submitting herewith the following documents for your kind perusal and further necessary action:</p>
<ol><li>Tax Invoice</li><li>Delivery Challan</li><li>&nbsp;</li></ol>
<p>Kindly acknowledge the receipt of the same.</p>${sign}`;
    case 'Notice':
      return `<p style="text-align:center"><b><u>NOTICE</u></b></p><p style="text-align:right">Date: ${date}</p><p>&nbsp;</p><p>&nbsp;</p>${sign}`;
    case 'Blank':
      return '<p><br></p>';
    default:
      return `${ref}${to}<p><b>Subject: </b></p><p>Dear Sir / Madam,</p><p>&nbsp;</p><p>&nbsp;</p>${sign}`;
  }
}

/* ───────── toolbar pieces: colour palette, drop-down menu ───────── */
const mix = (hex, to, t) => {
  const a = parseInt(hex.slice(1), 16); const b = parseInt(to.slice(1), 16);
  const ch = s => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1).toUpperCase()}`;
};
const THEME = ['#000000', '#FFFFFF', '#44546A', '#E7E6E6', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
const STANDARD = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'];
const SHADES = [[0.5, 0.05, 0.8], [0.65, 0.15, 0.6], [0.75, 0.25, 0.4], [0.85, 0.35, -0.25], [0.95, 0.5, -0.5]];
const PALETTE = [THEME, ...SHADES.map(([k, w, t]) => THEME.map((c, i) => (i === 0 ? mix(c, '#FFFFFF', k) : i === 1 ? mix(c, '#000000', w) : t > 0 ? mix(c, '#FFFFFF', t) : mix(c, '#000000', -t))))];

function usePop() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const k = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return [open, setOpen, ref];
}
const keep = e => { if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) e.preventDefault(); };

/* a colour button: the bar under the icon is the last colour; ▾ opens the palette */
function ColorMenu({ title, icon, color, onPick, noneLabel, onOpen }) {
  const [open, setOpen, ref] = usePop();
  const [custom, setCustom] = useState('#1F4E79');
  const pick = c => { setOpen(false); onPick(c); };
  return (
    <span className="of-dd of-cm" ref={ref}>
      <button type="button" className="of-ib of-cb" title={title} aria-label={title} onMouseDown={keep} onClick={() => pick(color)}>{icon}<i style={{ background: color || 'transparent' }} /></button>
      <button type="button" className="of-ib of-ca" title={`${title} — more colours`} aria-label={`${title} — choose colour`} aria-expanded={open} onMouseDown={keep} onClick={() => { onOpen?.(); setOpen(o => !o); }}>▾</button>
      {open && (
        <div className="of-pop of-pal" onMouseDown={keep}>
          {noneLabel && <button type="button" className="of-none" onClick={() => pick('')}>{noneLabel}</button>}
          <small>Theme colours</small>
          <div className="g">{PALETTE.map((row, i) => row.map(c => <button key={`${i}${c}`} type="button" title={c} aria-label={c} style={{ background: c }} className={i === 0 ? 't' : ''} onClick={() => pick(c)} />))}</div>
          <small>Standard colours</small>
          <div className="g">{STANDARD.map(c => <button key={c} type="button" title={c} aria-label={c} style={{ background: c }} onClick={() => pick(c)} />)}</div>
          <div className="more"><span>More colours</span><input type="color" value={custom} onChange={e => setCustom(e.target.value)} aria-label="Pick any colour" /><button type="button" className="of-ib" onClick={() => pick(custom.toUpperCase())}>Use</button></div>
        </div>
      )}
    </span>
  );
}

/* a drop-down: items [{ label, hint, onClick, on, disabled }] or '-' for a line; or render(close) for a custom panel */
function Menu({ label, title, items, render, wide, onOpen }) {
  const [open, setOpen, ref] = usePop();
  return (
    <span className="of-dd" ref={ref}>
      <button type="button" className={`of-ib${open ? ' on' : ''}`} title={title} aria-haspopup="menu" aria-expanded={open} onMouseDown={keep} onClick={() => { onOpen?.(); setOpen(o => !o); }}>{label}<span className="cv">▾</span></button>
      {open && (
        <div className={`of-pop of-menu${wide ? ' wide' : ''}`} role="menu" onMouseDown={keep}>
          {render ? render(() => setOpen(false)) : items.map((it, i) => (it === '-' ? <hr key={i} /> : (
            <button key={i} type="button" role="menuitem" className={it.on ? 'on' : ''} disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}>
              <span>{it.label}</span>{it.hint && <small>{it.hint}</small>}
            </button>
          )))}
        </div>
      )}
    </span>
  );
}
const Tb = ({ title, on, onClick, children, disabled, wide }) => (
  <button type="button" className={`of-ib${on ? ' on' : ''}${wide ? ' w' : ''}`} title={title} aria-label={title} aria-pressed={on === undefined ? undefined : !!on} disabled={disabled} onMouseDown={keep} onClick={onClick}>{children}</button>
);
const IcoA = ({ k }) => <span className={`of-ia ${k}`}>A</span>;

/* ───────── Word ───────── */
const FONTS = ['Arial', 'Calibri', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS', 'Consolas', 'Courier New', 'Garamond', 'Georgia', 'Helvetica', 'Lucida Sans', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 48, 72];
const SYMBOLS = ['₹', '€', '$', '£', '¥', '©', '®', '™', '°', '±', '×', '÷', '≤', '≥', '≠', '≈', '∞', '√', '∑', 'µ', 'Ω', 'π', 'α', 'β', '½', '¼', '¾', '²', '³', '✓', '✗', '•', '→', '←', '↑', '↓', '§', '¶', '…', '—'];
const STYLES = [['p', 'Normal'], ['h1', 'Title'], ['h2', 'Heading 1'], ['h3', 'Heading 2'], ['h4', 'Heading 3'], ['blockquote', 'Quote']];
const BLOCKS = 'p,h1,h2,h3,h4,blockquote,li';

function WordEditor({ companyId, co, user, docId, letterheads, orders, clients, setNote, navigate }) {
  const ed = useRef(null);
  const probe = useRef(null);
  const range = useRef(null);       // the last selection inside the letter (toolbar clicks and colour pickers take the focus away)
  const imgFile = useRef(null);
  const [doc, setDoc] = useState(null);
  const [loaded, setLoaded] = useState(!docId);
  const [type, setType] = useState('Letter');
  const [lhId, setLhId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const [signing, setSigning] = useState(false);
  const [preLink, setPreLink] = useState(null);
  const [pages, setPages] = useState(1);
  const [fmt, setFmt] = useState({});
  const [inTable, setInTable] = useState(false);
  const [img, setImg] = useState(null);
  const [fr, setFr] = useState(null);        // find & replace { q, r, i, info }
  const [zoom, setZoom] = useState(1);
  const [count, setCount] = useState(0);
  const [fc, setFc] = useState('#C00000');
  const [hl, setHl] = useState('#FFFF00');
  const by = user?.name || user?.username || '';
  const act = useDocActions({ companyId, kind: 'word', onSaved: (d, quiet) => { setDoc(d); if (!quiet) { setDirty(false); setNote(`Saved “${d.title}”.`); if (!docId) navigate(`/beta/office/word?id=${d.docId}`, { replace: true }); } } });
  const lh = letterheads.find(x => x.id === lhId) || null;
  const m = lh ? { top: lh.top, bottom: lh.bottom, left: lh.left, right: lh.right } : DEF_M;
  const touched = () => { setDirty(true); setCount((ed.current?.innerText || '').trim().split(/\s+/).filter(Boolean).length); };

  useEffect(() => {
    if (!docId) { setDoc(null); setLoaded(true); return; }
    setLoaded(false);
    axios.get(`/api/office/docs/${docId}`, { params: { companyId } }).then(r => {
      setDoc(r.data); setType(r.data.letterType || 'Letter'); setLhId(r.data.letterheadId || '');
      if (ed.current) ed.current.innerHTML = r.data.html || '';
      setLoaded(true); setDirty(false);
      setCount((ed.current?.innerText || '').trim().split(/\s+/).filter(Boolean).length);
    }).catch(e => { act.setErr(errOf(e, 'Could not open the document.')); setLoaded(true); });
  }, [docId, companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (docId || !loaded || !ed.current || ed.current.innerHTML) return;
    ed.current.innerHTML = letterTemplate('Letter', { co, by });
  }, [docId, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!docId && !lhId && letterheads[0]) setLhId(letterheads[0].id); }, [docId, letterheads]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded && ed.current && doc && !ed.current.innerHTML) ed.current.innerHTML = doc.html || ''; }, [loaded, doc]);
  useEffect(() => {
    const el = ed.current; if (!el) return undefined;
    const upd = () => { const mmPx = (probe.current?.offsetHeight || 378) / 100; setPages(Math.max(1, Math.ceil(el.offsetHeight / ((297 - m.top - m.bottom) * mmPx)))); };
    upd(); const ro = new ResizeObserver(upd); ro.observe(el); return () => ro.disconnect();
  }, [m.top, m.bottom, loaded]);
  useEffect(() => {
    if (!dirty) return undefined;
    const h = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const readFmt = () => {
    const q = c => { try { return document.queryCommandState(c); } catch { return false; } };
    const s = window.getSelection(); let n = s?.anchorNode; if (!n) return;
    n = n.nodeType === 3 ? n.parentNode : n;
    if (!ed.current?.contains(n)) return;
    const cs = getComputedStyle(n);
    setFmt({ b: q('bold'), i: q('italic'), u: q('underline'), s: q('strikeThrough'), sup: q('superscript'), sub: q('subscript'), ul: q('insertUnorderedList'), ol: q('insertOrderedList'),
      font: (cs.fontFamily.split(',')[0] || '').replace(/["']/g, '').trim(), size: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2,
      block: (n.closest('h1,h2,h3,h4,blockquote')?.tagName || 'P').toLowerCase(), al: cs.textAlign });
    setInTable(!!n.closest('td,th'));
  };
  useEffect(() => {
    const h = () => {
      const s = window.getSelection(); if (!s.rangeCount || !ed.current) return;
      const r = s.getRangeAt(0); if (!ed.current.contains(r.commonAncestorContainer)) return;
      range.current = r.cloneRange(); readFmt();
    };
    document.addEventListener('selectionchange', h); return () => document.removeEventListener('selectionchange', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const restore = () => {
    const el = ed.current; if (!el) return;
    el.focus({ preventScroll: true });
    if (range.current && el.contains(range.current.commonAncestorContainer)) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(range.current); }
  };
  const cmd = (c, v = null) => { restore(); document.execCommand('styleWithCSS', false, true); document.execCommand(c, false, v); touched(); readFmt(); };
  const fontSize = pt => {
    restore(); document.execCommand('styleWithCSS', false, false); document.execCommand('fontSize', false, '7');
    ed.current.querySelectorAll('font[size="7"]').forEach(f => { const s = document.createElement('span'); s.style.fontSize = `${pt}pt`; s.innerHTML = f.innerHTML; f.replaceWith(s); });
    touched(); readFmt();
  };
  const grow = d => { const cur = fmt.size || 11; const nx = d > 0 ? SIZES.find(x => x > cur) : [...SIZES].reverse().find(x => x < cur); if (nx) fontSize(nx); };
  const blocks = () => {
    restore(); const s = window.getSelection(); if (!s.rangeCount) return [];
    const r = s.getRangeAt(0);
    let list = [...ed.current.querySelectorAll(BLOCKS)].filter(b => r.intersectsNode(b) && !b.querySelector(BLOCKS));
    if (!list.length) {
      document.execCommand('formatBlock', false, 'p');
      const n = window.getSelection().anchorNode; const b = (n?.nodeType === 3 ? n.parentNode : n)?.closest?.(BLOCKS);
      list = b && ed.current.contains(b) ? [b] : [];
    }
    return list;
  };
  const eachBlock = fn => { blocks().forEach(fn); touched(); };
  const indent = d => {
    const bl = blocks();
    if (bl.some(b => b.tagName === 'LI')) { cmd(d > 0 ? 'indent' : 'outdent'); return; }
    bl.forEach(b => { const v = Math.max(0, (parseFloat(b.style.marginLeft) || 0) + d * 10); b.style.marginLeft = v ? `${v}mm` : ''; }); touched();
  };
  const changeCase = mode => {
    restore(); const t = window.getSelection().toString(); if (!t) return;
    const out = mode === 'up' ? t.toUpperCase() : mode === 'low' ? t.toLowerCase() : mode === 'title' ? t.toLowerCase().replace(/(^|[\s(\-/])(\S)/g, (x, a, b) => a + b.toUpperCase()) : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    document.execCommand('insertText', false, out); touched();
  };
  const cellAt = () => { const n = range.current?.startContainer; const el = n && (n.nodeType === 3 ? n.parentNode : n); return el?.closest?.('td,th') || null; };
  const tableOp = op => {
    const td = cellAt(); if (!td) return;
    const tr = td.parentNode; const table = td.closest('table'); const ci = [...tr.children].indexOf(td);
    if (op === 'rowA' || op === 'rowB') { const n = tr.cloneNode(true); [...n.children].forEach(x => { x.innerHTML = '&nbsp;'; }); tr.parentNode.insertBefore(n, op === 'rowA' ? tr : tr.nextSibling); }
    if (op === 'colL' || op === 'colR') table.querySelectorAll('tr').forEach(row => { const ref = row.children[ci]; const n = document.createElement(ref?.tagName === 'TH' ? 'th' : 'td'); n.innerHTML = '&nbsp;'; if (ref) row.insertBefore(n, op === 'colL' ? ref : ref.nextSibling); else row.appendChild(n); });
    if (op === 'delRow') { if (table.querySelectorAll('tr').length <= 1) table.remove(); else tr.remove(); }
    if (op === 'delCol') { if (tr.children.length <= 1) table.remove(); else table.querySelectorAll('tr').forEach(row => row.children[ci]?.remove()); }
    if (op === 'delTable') table.remove();
    if (op === 'border') table.classList.toggle('nb');
    if (op === 'head') table.querySelector('tr')?.querySelectorAll('td,th').forEach(x => { x.style.fontWeight = x.style.fontWeight ? '' : 'bold'; });
    if (op === 'fit') table.style.width = table.style.width ? '' : 'auto';
    touched(); readFmt();
  };
  const cellColor = c => { const td = cellAt(); if (!td) return; const tr = td.parentNode; (window.getSelection().toString() && tr ? [...tr.children] : [td]).forEach(x => { x.style.background = c || ''; }); touched(); };
  const insertTable = (r, c) => cmd('insertHTML', `<table><tbody>${Array.from({ length: r }, () => `<tr>${'<td>&nbsp;</td>'.repeat(c)}</tr>`).join('')}</tbody></table><p><br></p>`);
  const addImage = e => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (!/^image\//.test(f.type)) { act.setErr('Choose a picture (PNG / JPG).'); return; }
    if (f.size > 2 * 1024 * 1024) { act.setErr('The picture is too big — max 2 MB.'); return; }
    const rd = new FileReader(); rd.onload = () => cmd('insertHTML', `<img src="${rd.result}" style="width:60mm" alt="">`); rd.readAsDataURL(f);
  };
  const imgOp = op => {
    const el = img; if (!el) return;
    const w = parseFloat(el.style.width) || 60;
    if (op === '+') el.style.width = `${Math.min(170, w + 10)}mm`;
    if (op === '-') el.style.width = `${Math.max(10, w - 10)}mm`;
    if (['l', 'c', 'r'].includes(op)) { el.style.float = ''; el.style.display = 'block'; el.style.margin = op === 'l' ? '0 auto 0 0' : op === 'c' ? '0 auto' : '0 0 0 auto'; }
    if (op === 'wl' || op === 'wr') { el.style.display = ''; el.style.float = op === 'wl' ? 'left' : 'right'; el.style.margin = op === 'wl' ? '0 4mm 2mm 0' : '0 0 2mm 4mm'; }
    if (op === 'x') { el.remove(); setImg(null); }
    touched();
  };
  useEffect(() => { if (!ed.current) return; ed.current.querySelectorAll('img.of-isel').forEach(x => x.classList.remove('of-isel')); if (img) img.classList.add('of-isel'); }, [img]);
  const matches = q => {
    const out = []; if (!q || !ed.current) return out;
    const w = document.createTreeWalker(ed.current, NodeFilter.SHOW_TEXT); const ql = q.toLowerCase(); let n;
    while ((n = w.nextNode())) { const t = n.nodeValue.toLowerCase(); let i = t.indexOf(ql); while (i >= 0) { out.push([n, i]); i = t.indexOf(ql, i + ql.length); } }
    return out;
  };
  const findNext = () => {
    const list = matches(fr.q); if (!list.length) { setFr(f => ({ ...f, info: 'Not found' })); return; }
    const i = ((fr.i ?? -1) + 1) % list.length; const [n, o] = list[i];
    const r = document.createRange(); r.setStart(n, o); r.setEnd(n, o + fr.q.length);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); range.current = r.cloneRange();
    n.parentNode.scrollIntoView?.({ block: 'center' });
    setFr(f => ({ ...f, i, info: `${i + 1} of ${list.length}` }));
  };
  const replaceOne = () => {
    const s = window.getSelection();
    if (s.toString().toLowerCase() === String(fr.q).toLowerCase() && ed.current.contains(s.anchorNode)) { document.execCommand('insertText', false, fr.r || ''); touched(); setFr(f => ({ ...f, i: (f.i ?? 0) - 1 })); }
    setTimeout(findNext, 0);
  };
  const replaceAll = () => {
    const list = matches(fr.q);
    for (let k = list.length - 1; k >= 0; k -= 1) { const [n, o] = list[k]; n.nodeValue = n.nodeValue.slice(0, o) + (fr.r || '') + n.nodeValue.slice(o + fr.q.length); }
    if (list.length) touched();
    setFr(f => ({ ...f, i: -1, info: `${list.length} replaced` }));
  };
  const applyType = (t, link = preLink) => {
    if ((dirty || doc) && !window.confirm(`Start the ${t} format again? The text written now is replaced.`)) return;
    setType(t);
    const order = link?.orderNo ? orders.find(o => String(o.orderId) === String(link.orderId)) : (doc?.orderId ? orders.find(o => String(o.orderId) === String(doc.orderId)) : null);
    const client = clients.find(c => String(c.clientId) === String(order?.customerCode || link?.clientId || doc?.clientId));
    ed.current.innerHTML = letterTemplate(t, { co, order, client, by });
    touched();
  };
  const html = () => (ed.current?.innerHTML || '').replace(/ class="of-isel"/g, '').replace(/ of-isel/g, '');
  const doSave = async link => {
    const d = await act.save({ docId: doc?.docId, letterType: type, letterheadId: lhId, html: html(), title: link?.title || doc?.title, ...(link || { orderId: doc.orderId, orderNo: doc.orderNo, clientId: doc.clientId, clientName: doc.clientName }) });
    if (d) setAsking(false);
    return d;
  };
  const saveClick = () => (doc ? doSave(null) : setAsking(true));
  const makePdf = async () => {
    let d = doc;
    if (!d) { setAsking(true); return; }
    if (dirty) { d = await doSave(null); if (!d) return; }
    act.pdf(d, pageHtml(`<div class="lt">${html()}</div>`, m, { title: d.title }));
  };
  const viewPdf = async () => {
    try {
      const r = await axios.get(`/api/office/docs/${doc.docId}/pdf`, { params: { companyId }, responseType: 'blob' });
      openPreview(doc.title, { pdfUrl: URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })), fileName: `${[doc.clientName, doc.title].filter(Boolean).join(' - ')}.pdf` });
    } catch (e) { act.setErr(await blobErr(e, 'Could not open the PDF.')); }
  };
  const download = () => {
    const blob = new Blob([`<html><head><meta charset="utf-8"><style>${DOC_CSS}</style></head><body style="font-family:Arial;font-size:11pt">${html()}</body></html>`], { type: 'application/msword' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(doc?.title || type).replace(/[\\/:*?"<>|]+/g, '-')}.doc`; a.click();
  };
  const onKey = e => {
    const k = e.key.toLowerCase(); const c = e.ctrlKey || e.metaKey;
    if (c && k === 's') { e.preventDefault(); saveClick(); }
    else if (c && (k === 'f' || k === 'h')) { e.preventDefault(); setFr(f => f || { q: window.getSelection().toString().slice(0, 80), r: '', i: -1, info: '' }); }
    else if (c && e.shiftKey && (k === '>' || k === '.')) { e.preventDefault(); grow(1); }
    else if (c && e.shiftKey && (k === '<' || k === ',')) { e.preventDefault(); grow(-1); }
    else if (e.key === 'Tab' && !c) { const td = cellAt(); if (!td) { e.preventDefault(); cmd('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;'); } }
  };
  const st = act.busy === 'save' ? ['', 'Saving…'] : dirty ? ['dirty', 'Not saved'] : doc?.signedAt ? ['ok', `✓ Signed PDF · ${doc.signedBy}`] : doc?.pdfAt ? ['ok', '✓ PDF made'] : doc ? ['ok', 'Saved'] : ['', 'New letter'];

  return (<>
    <div className="of-bar">
      <select value={type} onChange={e => applyType(e.target.value)} aria-label="Letter type" title="Letter type — starts the letter from this format">{LETTER_TYPES.map(t => <option key={t}>{t}</option>)}</select>
      <select value={lhId} onChange={e => { setLhId(e.target.value); setDirty(true); }} aria-label="Letterhead" title="Letterhead">
        <option value="">No letterhead</option>{letterheads.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {!doc && (
        <span className="of-link" title="Choose the order now to fill the client and PO in the letter">
          <Picker value={preLink ? preLink.orderNo : ''} placeholder="Order (fills the letter)…" ariaLabel="Order for the letter"
            groups={[{ group: 'Sales orders', items: orders.map(o => ({ key: o.orderId, label: String(o.orderNo || '').trim(), sub: o.customerName || o.party, o })) }]}
            onPick={i => { const l = { orderId: String(i.o.orderId), orderNo: String(i.o.orderNo || '').trim(), clientId: String(i.o.customerCode || ''), clientName: i.o.customerName || i.o.party || '' }; setPreLink(l); if (!dirty) applyType(type, l); }} />
          {preLink && <button type="button" className="of-ib" onClick={() => applyType(type)} title="Fill the client, address and PO of this order in the letter">Fill</button>}
        </span>
      )}
      {doc && <span className="of-link">For <b>{doc.orderNo ? `SO ${doc.orderNo}` : doc.clientName}</b>{doc.orderNo && <> · {doc.clientName}</>}<button type="button" className="of-ib" onClick={() => setAsking(true)} title="Change the name / order">✎</button></span>}
      <span className="sp" />
      <span className={`of-state ${st[0]}`}>{st[1]}</span>
      <button type="button" className="of-ib pri" onClick={saveClick} disabled={!!act.busy}><Svg name="check" size={13} />Save</button>
      <button type="button" className="of-ib" onClick={() => makePdf()} disabled={!!act.busy}>{act.busy === 'pdf' ? 'Making…' : 'Make PDF'}</button>
      <button type="button" className="of-ib" onClick={() => setSigning(true)} disabled={!!act.busy || !doc?.pdfAt || dirty} title={doc?.pdfAt && !dirty ? 'Place your signature anywhere on the PDF' : 'Save and make the PDF first'}>✍ Sign</button>
      <button type="button" className="of-ib" onClick={viewPdf} disabled={!doc?.pdfAt || dirty}>View PDF</button>
      <button type="button" className="of-ib" onClick={download} title="Download as a Word file (.doc)">.doc</button>
    </div>

    <div className="of-bar of-tools" role="toolbar" aria-label="Formatting">
      <div className="of-grp">
        <Tb title="Undo (Ctrl+Z)" onClick={() => cmd('undo')}>↺</Tb>
        <Tb title="Redo (Ctrl+Y)" onClick={() => cmd('redo')}>↻</Tb>
      </div>
      <div className="of-grp">
        <select value={STYLES.some(([t]) => t === fmt.block) ? fmt.block : 'p'} onChange={e => cmd('formatBlock', e.target.value)} aria-label="Style" title="Style">{STYLES.map(([t, l]) => <option key={t} value={t}>{l}</option>)}</select>
        <select className="fnt" value={FONTS.find(f => f.toLowerCase() === String(fmt.font).toLowerCase()) || ''} onChange={e => cmd('fontName', e.target.value)} aria-label="Font" title="Font">
          <option value="" disabled>{fmt.font || 'Font'}</option>{FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
        </select>
        <select className="sz" value={SIZES.includes(fmt.size) ? fmt.size : ''} onChange={e => fontSize(e.target.value)} aria-label="Font size" title="Font size">
          <option value="" disabled>{fmt.size || 'Size'}</option>{SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Tb title="Bigger text (Ctrl+Shift+>)" onClick={() => grow(1)}>A<sup>+</sup></Tb>
        <Tb title="Smaller text (Ctrl+Shift+<)" onClick={() => grow(-1)}>A<sup>−</sup></Tb>
      </div>
      <div className="of-grp">
        <Tb title="Bold (Ctrl+B)" on={fmt.b} onClick={() => cmd('bold')}><b>B</b></Tb>
        <Tb title="Italic (Ctrl+I)" on={fmt.i} onClick={() => cmd('italic')}><i style={{ fontFamily: 'Georgia, serif' }}>I</i></Tb>
        <Tb title="Underline (Ctrl+U)" on={fmt.u} onClick={() => cmd('underline')}><u>U</u></Tb>
        <Tb title="Strikethrough" on={fmt.s} onClick={() => cmd('strikeThrough')}><s>ab</s></Tb>
        <Tb title="Superscript (x²)" on={fmt.sup} onClick={() => cmd('superscript')}>x<sup>2</sup></Tb>
        <Tb title="Subscript (x₂)" on={fmt.sub} onClick={() => cmd('subscript')}>x<sub>2</sub></Tb>
        <ColorMenu title="Font colour" icon={<IcoA k="fc" />} color={fc} noneLabel="Automatic (black)" onOpen={() => restore()} onPick={c => { if (c) setFc(c); cmd('foreColor', c || '#000000'); }} />
        <ColorMenu title="Highlight colour" icon={<span className="of-ia hl">ab</span>} color={hl} noneLabel="No highlight" onOpen={() => restore()} onPick={c => { if (c) setHl(c); cmd('hiliteColor', c || 'transparent'); }} />
        <Menu label="Aa" title="Change case" items={[
          { label: 'Sentence case.', onClick: () => changeCase('sent') }, { label: 'lowercase', onClick: () => changeCase('low') },
          { label: 'UPPERCASE', onClick: () => changeCase('up') }, { label: 'Capitalize Each Word', onClick: () => changeCase('title') }]} />
        <Tb title="Clear formatting" onClick={() => { cmd('removeFormat'); cmd('formatBlock', 'p'); }}>A<span className="of-x">✕</span></Tb>
      </div>
      <div className="of-grp">
        {[['justifyLeft', 'l', 'Align left', 'left', 'start'], ['justifyCenter', 'c', 'Centre', 'center'], ['justifyRight', 'r', 'Align right', 'right', 'end'], ['justifyFull', 'j', 'Justify', 'justify']].map(([c, a, l, v, v2]) => (
          <Tb key={c} title={l} on={fmt.al === v || (v2 && fmt.al === v2)} onClick={() => cmd(c)}><AlignIco a={a} /></Tb>))}
        <Tb title="Bullets" on={fmt.ul} onClick={() => cmd('insertUnorderedList')}>• ≡</Tb>
        <Tb title="Numbering" on={fmt.ol} onClick={() => cmd('insertOrderedList')}>1.≡</Tb>
        <Tb title="Decrease indent" onClick={() => indent(-1)}>⇤</Tb>
        <Tb title="Increase indent" onClick={() => indent(1)}>⇥</Tb>
        <Menu label="↕" title="Line and paragraph spacing" items={[
          ...['1.0', '1.15', '1.45', '1.5', '2.0', '2.5', '3.0'].map(v => ({ label: v === '1.45' ? '1.45 (normal)' : v, onClick: () => eachBlock(b => { b.style.lineHeight = v === '1.45' ? '' : v; }) })), '-',
          ...[[0, 'No space after paragraph'], [6, 'Space after: 6 pt'], [12, 'Space after: 12 pt'], [18, 'Space after: 18 pt']].map(([v, l]) => ({ label: l, onClick: () => eachBlock(b => { b.style.marginBottom = `${v}pt`; }) })),
          { label: 'Space after: normal', onClick: () => eachBlock(b => { b.style.marginBottom = ''; }) }]} />
      </div>
      <div className="of-grp">
        <Menu label="Table" title="Insert table" onOpen={() => restore()} render={close => <TableGrid onPick={(r, c) => { close(); insertTable(r, c); }} />} />
        <Tb title="Picture" onClick={() => imgFile.current?.click()}>Picture</Tb>
        <input ref={imgFile} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={addImage} />
        <Tb title="Link" onClick={() => { const u = window.prompt('Link address', 'https://'); if (u && u !== 'https://') cmd('createLink', u); }}>Link</Tb>
        <Menu label="Ω" title="Symbol" onOpen={() => restore()} render={close => (
          <div className="of-sym">{SYMBOLS.map(x => <button key={x} type="button" onClick={() => { close(); cmd('insertText', x); }}>{x}</button>)}</div>)} />
        <Tb title="Today's date" onClick={() => cmd('insertText', dmy(new Date()))}>Date</Tb>
        <Tb title="Line across" onClick={() => cmd('insertHorizontalRule')}>―</Tb>
        <Tb title="Page break — what follows starts on a new page" onClick={() => cmd('insertHTML', '<div class="pgb" contenteditable="false"></div><p><br></p>')}>Page break</Tb>
      </div>
      <div className="of-grp" style={{ borderRight: 0 }}>
        <Tb title="Find and replace (Ctrl+F)" on={!!fr} onClick={() => setFr(f => (f ? null : { q: '', r: '', i: -1, info: '' }))}>Find</Tb>
      </div>
    </div>

    {inTable && (
      <div className="of-bar of-ctx" role="toolbar" aria-label="Table">
        <b>Table</b>
        <Tb title="Insert row above" onClick={() => tableOp('rowA')}>+ Row above</Tb>
        <Tb title="Insert row below" onClick={() => tableOp('rowB')}>+ Row below</Tb>
        <Tb title="Insert column left" onClick={() => tableOp('colL')}>+ Col left</Tb>
        <Tb title="Insert column right" onClick={() => tableOp('colR')}>+ Col right</Tb>
        <Tb title="Delete row" onClick={() => tableOp('delRow')}>− Row</Tb>
        <Tb title="Delete column" onClick={() => tableOp('delCol')}>− Col</Tb>
        <Tb title="Header row bold" onClick={() => tableOp('head')}>Header bold</Tb>
        <Tb title="Borders on / off" onClick={() => tableOp('border')}>Borders</Tb>
        <Tb title="Full width / fit to text" onClick={() => tableOp('fit')}>Width</Tb>
        <ColorMenu title="Cell colour (select text across the row to colour the whole row)" icon={<span className="of-ia cell">▦</span>} color="#D9E2F3" noneLabel="No colour" onOpen={() => restore()} onPick={cellColor} />
        <Tb title="Delete table" onClick={() => tableOp('delTable')}>Delete table</Tb>
      </div>
    )}
    {img && (
      <div className="of-bar of-ctx" role="toolbar" aria-label="Picture">
        <b>Picture</b>
        <Tb title="Smaller" onClick={() => imgOp('-')}>− Smaller</Tb>
        <Tb title="Bigger" onClick={() => imgOp('+')}>+ Bigger</Tb>
        <Tb title="Left" onClick={() => imgOp('l')}><AlignIco a="l" /></Tb>
        <Tb title="Centre" onClick={() => imgOp('c')}><AlignIco a="c" /></Tb>
        <Tb title="Right" onClick={() => imgOp('r')}><AlignIco a="r" /></Tb>
        <Tb title="Text around, picture on the left" onClick={() => imgOp('wl')}>Wrap left</Tb>
        <Tb title="Text around, picture on the right" onClick={() => imgOp('wr')}>Wrap right</Tb>
        <Tb title="Remove picture" onClick={() => imgOp('x')}>Remove</Tb>
        <Tb title="Done" onClick={() => setImg(null)}>Done</Tb>
      </div>
    )}
    {fr && (
      <div className="of-bar of-ctx of-find" role="search">
        <b>Find</b>
        <input className="of-in" autoFocus value={fr.q} placeholder="Find…" aria-label="Find" onChange={e => setFr(f => ({ ...f, q: e.target.value, i: -1, info: '' }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); findNext(); } if (e.key === 'Escape') setFr(null); }} />
        <Tb title="Find next" onClick={findNext} disabled={!fr.q}>Next</Tb>
        <input className="of-in" value={fr.r} placeholder="Replace with…" aria-label="Replace with" onChange={e => setFr(f => ({ ...f, r: e.target.value }))} />
        <Tb title="Replace this one" onClick={replaceOne} disabled={!fr.q}>Replace</Tb>
        <Tb title="Replace all" onClick={replaceAll} disabled={!fr.q}>Replace all</Tb>
        <span className="of-state">{fr.info}</span>
        <Tb title="Close" onClick={() => setFr(null)}>✕</Tb>
      </div>
    )}
    {act.err && <div className="sb-ask"><span>{act.err}</span><button type="button" className="sb-abtn" onClick={() => act.setErr('')}>OK</button></div>}
    <div className="of-desk">
      <div className="of-page" style={{ zoom, padding: `${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm`, backgroundImage: lh ? `url(/api/office/letterheads/${lh.id}/preview)` : 'none' }}>
        <div ref={probe} style={{ position: 'absolute', visibility: 'hidden', height: '100mm', width: 1, top: 0, left: 0 }} />
        <div ref={ed} className="of-ed" contentEditable={loaded} suppressContentEditableWarning spellCheck
          onInput={touched} onKeyDown={onKey} onClick={e => setImg(e.target.tagName === 'IMG' ? e.target : null)} />
        {Array.from({ length: pages - 1 }, (_, i) => (
          <div key={i} className="of-pgline" style={{ top: `calc(${m.top}mm + ${(i + 1) * (297 - m.top - m.bottom)}mm)` }}><span>Page {i + 2} starts</span></div>
        ))}
      </div>
    </div>
    <div className="of-status">
      <span>{count} words</span><span>About {pages} page{pages > 1 ? 's' : ''}</span>
      <span className="sp" />
      <label>Zoom <select value={zoom} onChange={e => setZoom(+e.target.value)} aria-label="Zoom">{[0.5, 0.75, 0.9, 1, 1.25, 1.5, 2].map(z => <option key={z} value={z}>{Math.round(z * 100)}%</option>)}</select></label>
    </div>
    {signing && doc && <SignPlacer doc={doc} companyId={companyId} onClose={() => setSigning(false)} onSigned={blob => { setSigning(false); act.signed(doc, blob); }} />}
    {asking && <SaveDialog init={doc || { title: `${type}${preLink?.clientName ? ` - ${preLink.clientName}` : ''}`, ...(preLink || {}) }} orders={orders} clients={clients} busy={act.busy === 'save'} err={act.err}
      onCancel={() => { setAsking(false); act.setErr(''); }} onSave={doSave} />}
  </>);
}

function TableGrid({ onPick }) {
  const [h, setH] = useState([0, 0]);
  return (
    <div className="of-tg">
      <div className="g" onMouseLeave={() => setH([0, 0])}>
        {Array.from({ length: 8 }, (_, r) => Array.from({ length: 10 }, (__, c) => (
          <button key={`${r}-${c}`} type="button" aria-label={`${r + 1} by ${c + 1}`} className={r < h[0] && c < h[1] ? 'on' : ''} onMouseEnter={() => setH([r + 1, c + 1])} onClick={() => onPick(r + 1, c + 1)} />
        )))}
      </div>
      <small>{h[0] ? `${h[0]} rows × ${h[1]} columns` : 'Choose the size'}</small>
    </div>
  );
}

/* ───────── Excel ───────── */
const colName = i => { let s = ''; let n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const colIdx = s => s.split('').reduce((a, ch) => a * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
const keyOf = (r, c) => `${colName(c)}${r + 1}`;
const parseKey = k => { const m = /^\$?([A-Z]{1,2})\$?(\d+)$/.exec(k); return m ? { r: +m[2] - 1, c: colIdx(m[1]) } : null; };
const isNum = v => v !== '' && v != null && /^-?\d[\d,]*(\.\d+)?$|^-?\.\d+$/.test(String(v).trim());
const num = v => parseFloat(String(v).replace(/,/g, ''));
const REF = /^(\$?)([A-Z]{1,2})(\$?)(\d+)$/;
const REFS = /(?<![A-Z$\d])(\$?[A-Z]{1,2}\$?\d+)(?::(\$?[A-Z]{1,2}\$?\d+))?(?![\d(])/g;
/* formulas when rows / columns are inserted or deleted: fn(r, c, end) → { r, c } or null (that cell is gone) */
const remapFormula = (f, fn) => f.replace(REFS, (mm, a, b) => {
  const one = (ref, end) => { const x = REF.exec(ref); const q = fn(+x[4] - 1, colIdx(x[2]), end); return q && q.r >= 0 && q.c >= 0 ? `${x[1]}${colName(q.c)}${x[3]}${q.r + 1}` : null; };
  if (!b) return one(a) || '#REF!';
  const A = one(a, false); const B = one(b, true);
  if (!A || !B) return '#REF!';
  const pa = REF.exec(A); const pb = REF.exec(B);
  return +pb[4] < +pa[4] || colIdx(pb[2]) < colIdx(pa[2]) ? '#REF!' : `${A}:${B}`;
});
/* formulas copied / filled to another place: relative refs move, $-fixed ones stay */
const shiftRel = (f, dr, dc) => f.replace(/(?<![A-Z$\d])(\$?)([A-Z]{1,2})(\$?)(\d+)(?![\d(])/g, (mm, d1, col, d2, row) => {
  const c = d1 ? colIdx(col) : colIdx(col) + dc; const r = d2 ? +row - 1 : +row - 1 + dr;
  return c < 0 || r < 0 ? '#REF!' : `${d1}${colName(c)}${d2}${r + 1}`;
});

function evalSheet(cells) {
  const out = {};
  const busy = new Set();
  const val = k => {
    if (k in out) return out[k];
    const x = cells[k]; const raw = x?.v ?? '';
    if (x?.nf === 'text') { out[k] = String(raw); return out[k]; }
    if (!String(raw).startsWith('=')) { out[k] = isNum(raw) ? num(raw) : raw; return out[k]; }
    if (busy.has(k)) return '#CYCLE!';
    busy.add(k);
    let res;
    try { res = calc(String(raw).slice(1)); } catch (e) { res = String(e.message).startsWith('#') ? e.message : '#ERR'; }
    busy.delete(k);
    out[k] = res; return res;
  };
  const numOf = k => { const v = val(k); if (typeof v === 'string' && v.startsWith('#')) throw new Error(v); return typeof v === 'number' ? v : (isNum(v) ? num(v) : 0); };
  const range = (a, b) => {
    const p = parseKey(a); const q = parseKey(b); if (!p || !q) throw new Error('#REF!');
    const list = [];
    for (let r = Math.min(p.r, q.r); r <= Math.max(p.r, q.r); r += 1) for (let c = Math.min(p.c, q.c); c <= Math.max(p.c, q.c); c += 1) list.push(keyOf(r, c));
    return list;
  };
  const sum = a => a.reduce((s, x) => s + x, 0);
  const FN = {
    SUM: sum, AVERAGE: a => (a.length ? sum(a) / a.length : 0), AVG: a => FN.AVERAGE(a), MIN: a => (a.length ? Math.min(...a) : 0), MAX: a => (a.length ? Math.max(...a) : 0),
    COUNT: a => a.length, PRODUCT: a => a.reduce((s, x) => s * x, 1),
    ROUND: a => { const p = 10 ** (a[1] || 0); return Math.round((a[0] || 0) * p) / p; },
    ROUNDUP: a => { const p = 10 ** (a[1] || 0); return Math.ceil((a[0] || 0) * p) / p; },
    ROUNDDOWN: a => { const p = 10 ** (a[1] || 0); return Math.floor((a[0] || 0) * p) / p; },
    INT: a => Math.floor(a[0] || 0), ABS: a => Math.abs(a[0] || 0), SQRT: a => Math.sqrt(a[0] || 0), POWER: a => (a[0] || 0) ** (a[1] || 0), MOD: a => (a[0] || 0) % (a[1] || 1),
    IF: a => (a[0] ? (a[1] ?? 1) : (a[2] ?? 0)), AND: a => (a.every(Boolean) ? 1 : 0), OR: a => (a.some(Boolean) ? 1 : 0), NOT: a => (a[0] ? 0 : 1),
  };
  function calc(expr) {
    let e = String(expr).toUpperCase().replace(/\$/g, '');
    if (e.includes('#REF!')) throw new Error('#REF!');
    for (let guard = 0; guard < 80 && /\b([A-Z]+)\(([^()]*)\)/.test(e); guard += 1) {
      e = e.replace(/\b([A-Z]+)\(([^()]*)\)/, (all, f, args) => {
        if (f === 'COUNTA') {
          let n = 0;
          args.split(',').map(x => x.trim()).filter(Boolean).forEach(a => { const rg = /^([A-Z]{1,2}\d+):([A-Z]{1,2}\d+)$/.exec(a); (rg ? range(rg[1], rg[2]) : [a]).forEach(k => { if (parseKey(k) ? String(val(k)) !== '' : a) n += 1; }); });
          return `(${n})`;
        }
        if (!FN[f]) throw new Error('#NAME?');
        const nums = [];
        args.split(',').map(x => x.trim()).filter(Boolean).forEach(a => {
          const rg = /^([A-Z]{1,2}\d+):([A-Z]{1,2}\d+)$/.exec(a);
          if (rg) range(rg[1], rg[2]).forEach(k => { const v = val(k); if (typeof v === 'number') nums.push(v); else if (isNum(v)) nums.push(num(v)); else if (typeof v === 'string' && v.startsWith('#')) throw new Error(v); });
          else nums.push(arith(a));
        });
        return `(${FN[f](nums)})`;
      });
    }
    return arith(e);
  }
  function arith(e) {
    let x = String(e).replace(/\b([A-Z]{1,2}\d+)\b/g, k => `(${numOf(k)})`).replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    x = x.replace(/<>/g, '!=').replace(/(^|[^<>!=])=(?!=)/g, '$1==');
    if (!/^[\d+\-*/().\s eE<>=!]*$/.test(x)) throw new Error('#VALUE!');
    // eslint-disable-next-line no-new-func
    let r = Function(`"use strict"; return (${x || 0});`)();
    if (typeof r === 'boolean') r = r ? 1 : 0;
    if (typeof r !== 'number' || !Number.isFinite(r)) throw new Error('#DIV/0!');
    return Math.round(r * 1e10) / 1e10;
  }
  Object.keys(cells).forEach(val);
  return { get: k => (k in out ? out[k] : (cells[k]?.v ?? '')) };
}
const shown = v => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toLocaleString('en-IN', { maximumFractionDigits: 4, useGrouping: false })) : String(v ?? ''));
const fmtVal = (v, x) => {
  if (typeof v !== 'number') return String(v ?? '');
  const nf = x?.nf || ''; const dp = x?.dp ?? (nf === 'pct' ? 0 : 2);
  const loc = o => v.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp, ...o });
  if (nf === 'num') return loc();
  if (nf === 'inr') return `₹ ${loc()}`;
  if (nf === 'pct') return `${(v * 100).toFixed(dp)}%`;
  if (nf === 'plain') return v.toFixed(dp);
  if (x?.dp != null) return v.toFixed(x.dp);
  return shown(v);
};
const XL_FMT = [['', 'General'], ['num', 'Number  1,23,456.00'], ['inr', 'Rupees  ₹ 1,23,456.00'], ['pct', 'Percent  12%'], ['plain', 'Number  123456.00'], ['text', 'Text']];
const XL_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36];
const AL_CSS = { l: 'left', c: 'center', r: 'right' };
const VA_CSS = { t: 'top', m: 'middle', b: 'bottom' };
const cellCss = (x, num0) => {
  if (!x) return num0 ? { textAlign: 'right' } : undefined;
  const bd = x.bd || '';
  const line = '1px solid #000';
  return {
    fontWeight: x.b ? 700 : undefined, fontStyle: x.i ? 'italic' : undefined,
    textDecoration: [x.u && 'underline', x.s && 'line-through'].filter(Boolean).join(' ') || undefined,
    color: x.fc || undefined, background: x.bg || undefined, fontSize: x.fs ? `${x.fs}pt` : undefined,
    textAlign: x.a ? AL_CSS[x.a] : num0 ? 'right' : undefined, verticalAlign: x.va ? VA_CSS[x.va] : undefined,
    whiteSpace: x.wr ? 'normal' : undefined, overflowWrap: x.wr ? 'anywhere' : undefined,
    borderTop: bd.includes('t') ? line : undefined, borderBottom: bd.includes('b') ? line : undefined,
    borderLeft: bd.includes('l') ? line : undefined, borderRight: bd.includes('r') ? line : undefined,
  };
};
const cssText = o => Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k.replace(/[A-Z]/g, ch => `-${ch.toLowerCase()}`)}:${v}`).join(';');
const blankSheet = () => ({ rows: 50, cols: 15, cells: {}, widths: {}, heights: {}, merges: [], grid: true });

function ExcelEditor({ companyId, user, docId, letterheads, orders, clients, setNote, navigate }) {
  const [doc, setDoc] = useState(null);
  const [sheet, setSheetRaw] = useState(blankSheet);
  const cur = useRef(sheet);
  const past = useRef([]); const future = useRef([]);
  const [sel, setSel] = useState({ r: 0, c: 0 });
  const [foc, setFoc] = useState({ r: 0, c: 0 });
  const [edit, setEditRaw] = useState(null);
  const [src, setSrc] = useState('cell');     // typing in the cell or in the formula bar
  const editR = useRef(null);
  const setEdit = (v, from) => { editR.current = v; setEditRaw(v); if (from) setSrc(from); };
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const [signing, setSigning] = useState(false);
  const [lhId, setLhId] = useState('');
  const [landscape, setLandscape] = useState(false);
  const [ctx, setCtx] = useState(null);      // right-click menu { x, y }
  const [fc, setFc] = useState('#C00000');
  const [bg, setBg] = useState('#FFFF00');
  const grid = useRef(null);
  const fxIn = useRef(null);
  const fileRef = useRef(null);
  const drag = useRef(null);
  const point = useRef(null);                // building a formula by clicking cells
  const clip = useRef(null);
  const act = useDocActions({ companyId, kind: 'excel', onSaved: (d, quiet) => { setDoc(d); if (!quiet) { setDirty(false); setNote(`Saved “${d.title}”.`); if (!docId) navigate(`/beta/office/excel?id=${d.docId}`, { replace: true }); } } });
  const ev = useMemo(() => evalSheet(sheet.cells), [sheet.cells]);
  const lh = letterheads.find(x => x.id === lhId) || null;
  const m = lh ? { top: lh.top, bottom: lh.bottom, left: lh.left, right: lh.right } : { top: 12, bottom: 12, left: 10, right: 10 };

  const load = s => { const x = { ...blankSheet(), ...s, cells: s?.cells || {}, merges: s?.merges || [], widths: s?.widths || {}, heights: s?.heights || {}, grid: s?.grid !== false }; cur.current = x; setSheetRaw(x); past.current = []; future.current = []; };
  const update = fn => { const prev = cur.current; const next = fn(prev); if (!next || next === prev) return; past.current.push(prev); if (past.current.length > 100) past.current.shift(); future.current = []; cur.current = next; setSheetRaw(next); setDirty(true); };
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(cur.current); cur.current = p; setSheetRaw(p); setDirty(true); };
  const redo = () => { const f = future.current.pop(); if (!f) return; past.current.push(cur.current); cur.current = f; setSheetRaw(f); setDirty(true); };

  useEffect(() => {
    if (!docId) { setDoc(null); return; }
    axios.get(`/api/office/docs/${docId}`, { params: { companyId } }).then(r => {
      setDoc(r.data); load(r.data.sheet); setLhId(r.data.letterheadId || ''); setLandscape(!!r.data.landscape); setDirty(false);
    }).catch(e => act.setErr(errOf(e, 'Could not open the sheet.')));
  }, [docId, companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return undefined;
    const h = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  useEffect(() => {
    const up = () => {
      const d = drag.current; drag.current = null; point.current = point.current && { ...point.current, dragging: false };
      if (d && (d.kind === 'col' || d.kind === 'row')) { past.current.push(d.snap); future.current = []; setDirty(true); }
    };
    const mv = e => {
      const d = drag.current; if (!d || (d.kind !== 'col' && d.kind !== 'row')) return;
      const s = cur.current;
      const next = d.kind === 'col'
        ? { ...s, widths: { ...s.widths, [colName(d.i)]: Math.round(Math.min(600, Math.max(30, d.v0 + e.clientX - d.x0))) } }
        : { ...s, heights: { ...s.heights, [d.i]: Math.round(Math.min(300, Math.max(16, d.v0 + e.clientY - d.y0))) } };
      cur.current = next; setSheetRaw(next);
    };
    window.addEventListener('mouseup', up); window.addEventListener('mousemove', mv);
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('mousemove', mv); };
  }, []);
  useEffect(() => { if (!ctx) return undefined; const h = () => setCtx(null); window.addEventListener('mousedown', h); return () => window.removeEventListener('mousedown', h); }, [ctx]);

  const merges = useMemo(() => {
    const master = {}; const hidden = new Set(); const rects = [];
    (sheet.merges || []).forEach(mg => {
      const [a, b] = mg.split(':').map(parseKey); if (!a || !b) return;
      rects.push({ r1: a.r, c1: a.c, r2: b.r, c2: b.c });
      master[keyOf(a.r, a.c)] = { rs: b.r - a.r + 1, cs: b.c - a.c + 1 };
      for (let r = a.r; r <= b.r; r += 1) for (let c = a.c; c <= b.c; c += 1) if (r !== a.r || c !== a.c) hidden.add(keyOf(r, c));
    });
    return { master, hidden, rects };
  }, [sheet.merges]);
  const rg = { r1: Math.min(sel.r, foc.r), r2: Math.max(sel.r, foc.r), c1: Math.min(sel.c, foc.c), c2: Math.max(sel.c, foc.c) };
  const multi = rg.r1 !== rg.r2 || rg.c1 !== rg.c2;
  const k = keyOf(sel.r, sel.c);
  const cell = sheet.cells[k] || {};
  const W = c => sheet.widths[colName(c)] || 100;
  const H = r => sheet.heights[r] || 22;
  const inRg = (r, c) => r >= rg.r1 && r <= rg.r2 && c >= rg.c1 && c <= rg.c2;
  const rectOf = (r, c) => merges.rects.find(x => r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2);
  const forRange = fn => { for (let r = rg.r1; r <= rg.r2; r += 1) for (let c = rg.c1; c <= rg.c2; c += 1) fn(r, c, keyOf(r, c)); };
  const cleanCell = x => { const y = {}; Object.entries(x).forEach(([f, v]) => { if (f === 'dp' ? v != null : (v !== '' && v != null && v !== 0 && v !== false)) y[f] = v; }); return Object.keys(y).length ? y : null; };
  const putCells = (s, patches) => { const cells = { ...s.cells }; Object.entries(patches).forEach(([key, p]) => { const y = cleanCell({ ...(cells[key] || {}), ...p }); if (y) cells[key] = y; else delete cells[key]; }); return { ...s, cells }; };
  const fmtRange = patch => update(s => { const ps = {}; forRange((r, c, key) => { ps[key] = typeof patch === 'function' ? patch(s.cells[key] || {}, r, c) : patch; }); return putCells(s, ps); });
  const toggle = f => { const on = !cell[f]; fmtRange({ [f]: on ? 1 : 0 }); };

  const commit = () => { const v = editR.current; if (v != null) { setEdit(null); point.current = null; update(s => putCells(s, { [k]: { v } })); } };
  const go = (r, c, extend) => {
    const rr = Math.max(0, r); const cc = Math.max(0, Math.min(cur.current.cols - 1, c));
    if (rr >= cur.current.rows) update(s => ({ ...s, rows: Math.min(1000, rr + 20) }));
    if (extend) setFoc({ r: rr, c: cc }); else { setSel({ r: rr, c: cc }); setFoc({ r: rr, c: cc }); }
  };
  const move = (dr, dc, extend) => { commit(); const base = extend ? foc : sel; go(base.r + dr, base.c + dc, extend); grid.current?.focus(); };
  const pickCell = (e, r, c) => {
    if (e.button === 2) { if (!inRg(r, c)) { commit(); setSel({ r, c }); setFoc({ r, c }); } return; }
    // building a formula: clicking a cell adds its address
    if (edit != null && String(edit).startsWith('=') && !(r === sel.r && c === sel.c) && /[(=,+\-*/:<>]$/.test(edit)) {
      e.preventDefault(); point.current = { base: edit, start: keyOf(r, c), dragging: true }; setEdit(edit + keyOf(r, c)); return;
    }
    commit();
    const mr = rectOf(r, c);
    if (e.shiftKey) setFoc({ r, c });
    else if (mr) { setSel({ r: mr.r1, c: mr.c1 }); setFoc({ r: mr.r2, c: mr.c2 }); } else { setSel({ r, c }); setFoc({ r, c }); }
    drag.current = { kind: 'sel' };
    grid.current?.focus();
  };
  const enterCell = (r, c) => {
    if (point.current?.dragging) { const p = point.current; const end = keyOf(r, c); setEdit(p.base + (end === p.start ? p.start : `${p.start}:${end}`)); return; }
    if (drag.current?.kind === 'sel') setFoc({ r, c });
  };
  const selCol = (c, e) => { commit(); if (e.shiftKey) { setFoc({ r: cur.current.rows - 1, c }); } else { setSel({ r: 0, c }); setFoc({ r: cur.current.rows - 1, c }); } grid.current?.focus(); };
  const selRow = (r, e) => { commit(); if (e.shiftKey) { setFoc({ r, c: cur.current.cols - 1 }); } else { setSel({ r, c: 0 }); setFoc({ r, c: cur.current.cols - 1 }); } grid.current?.focus(); };
  const selAll = () => { commit(); setSel({ r: 0, c: 0 }); setFoc({ r: cur.current.rows - 1, c: cur.current.cols - 1 }); grid.current?.focus(); };

  /* rows / columns */
  const shiftAxis = (axis, at, n) => update(s => {
    const del = n < 0 ? -n : 0;
    const mv = (v, end) => { if (n > 0) return v >= at ? v + n : v; if (v < at) return v; if (v >= at + del) return v - del; return end === undefined ? null : end ? at - 1 : at; };
    const fnRef = (r, c, end) => { const w = mv(axis === 'r' ? r : c, end); if (w == null || w < 0) return null; return axis === 'r' ? { r: w, c } : { r, c: w }; };
    const cells = {};
    Object.entries(s.cells).forEach(([key, x]) => {
      const p = parseKey(key); const w = mv(axis === 'r' ? p.r : p.c); if (w == null) return;
      const nx = { ...x }; if (String(nx.v || '').startsWith('=')) nx.v = remapFormula(nx.v, fnRef);
      cells[axis === 'r' ? keyOf(w, p.c) : keyOf(p.r, w)] = nx;
    });
    const mergesN = (s.merges || []).map(mg => remapFormula(mg, fnRef)).filter(mg => !mg.includes('#REF') && mg.includes(':') && (() => { const [a, b] = mg.split(':').map(parseKey); return a && b && (a.r !== b.r || a.c !== b.c); })());
    const sizes = {}; const src = axis === 'r' ? s.heights : s.widths;
    Object.entries(src || {}).forEach(([key, v]) => { const i = axis === 'r' ? +key : colIdx(key); const w = mv(i); if (w != null) sizes[axis === 'r' ? w : colName(w)] = v; });
    const out = { ...s, cells, merges: mergesN, [axis === 'r' ? 'heights' : 'widths']: sizes };
    if (axis === 'r') out.rows = Math.min(1000, Math.max(1, s.rows + n)); else out.cols = Math.min(52, Math.max(1, s.cols + n));
    return out;
  });
  const insRows = below => { commit(); const cnt = rg.r2 - rg.r1 + 1; shiftAxis('r', below ? rg.r2 + 1 : rg.r1, cnt); if (below) { setSel({ r: rg.r2 + 1, c: sel.c }); setFoc({ r: rg.r2 + cnt, c: foc.c }); } };
  const delRows = () => { commit(); shiftAxis('r', rg.r1, -(rg.r2 - rg.r1 + 1)); setSel({ r: rg.r1, c: sel.c }); setFoc({ r: rg.r1, c: sel.c }); };
  const insCols = right => { commit(); if (cur.current.cols >= 52) { act.setErr('A sheet can have up to 52 columns (AZ).'); return; } const cnt = Math.min(rg.c2 - rg.c1 + 1, 52 - cur.current.cols); shiftAxis('c', right ? rg.c2 + 1 : rg.c1, cnt); };
  const delCols = () => { commit(); shiftAxis('c', rg.c1, -(rg.c2 - rg.c1 + 1)); setSel({ r: sel.r, c: rg.c1 }); setFoc({ r: sel.r, c: rg.c1 }); };

  /* merge, borders, clear, fill, sort */
  const overlaps = mg => { const [a, b] = mg.split(':').map(parseKey); return a && b && !(b.r < rg.r1 || a.r > rg.r2 || b.c < rg.c1 || a.c > rg.c2); };
  const anyMerge = (sheet.merges || []).some(overlaps);
  const mergeToggle = () => {
    commit();
    if (anyMerge) { update(s => ({ ...s, merges: (s.merges || []).filter(mg => !overlaps(mg)) })); return; }
    if (!multi) return;
    const lost = []; forRange((r, c, key) => { if ((r !== rg.r1 || c !== rg.c1) && sheet.cells[key]?.v) lost.push(key); });
    if (lost.length && !window.confirm('Merging keeps only the top-left value. Merge anyway?')) return;
    update(s => {
      const ps = {}; forRange((r, c, key) => { if (r !== rg.r1 || c !== rg.c1) ps[key] = { v: '' }; });
      ps[keyOf(rg.r1, rg.c1)] = { a: (s.cells[keyOf(rg.r1, rg.c1)] || {}).a || 'c', va: (s.cells[keyOf(rg.r1, rg.c1)] || {}).va || 'm' };
      const n2 = putCells(s, ps);
      return { ...n2, merges: [...(s.merges || []).filter(mg => !overlaps(mg)), `${keyOf(rg.r1, rg.c1)}:${keyOf(rg.r2, rg.c2)}`] };
    });
  };
  const borders = mode => fmtRange((x, r, c) => {
    const b = new Set(String(x.bd || '').split('').filter(Boolean));
    if (mode === 'none') b.clear();
    if (mode === 'all') 'tlrb'.split('').forEach(z => b.add(z));
    if (mode === 'out' || mode === 't') { if (r === rg.r1) b.add('t'); }
    if (mode === 'out' || mode === 'b') { if (r === rg.r2) b.add('b'); }
    if (mode === 'out' || mode === 'l') { if (c === rg.c1) b.add('l'); }
    if (mode === 'out' || mode === 'r') { if (c === rg.c2) b.add('r'); }
    if (mode === 'inh') { if (r > rg.r1) b.add('t'); if (r < rg.r2) b.add('b'); }
    if (mode === 'inv') { if (c > rg.c1) b.add('l'); if (c < rg.c2) b.add('r'); }
    return { bd: [...b].sort().join('') };
  });
  const clear = what => { commit(); update(s => { const cells = { ...s.cells }; forRange((r, c, key) => { const x = cells[key]; if (!x) return; if (what === 'all') delete cells[key]; else if (what === 'v') { const y = cleanCell({ ...x, v: '' }); if (y) cells[key] = y; else delete cells[key]; } else { if (x.v) cells[key] = { v: x.v }; else delete cells[key]; } }); return { ...s, cells }; }); };
  const fill = dir => {
    commit(); if (!multi) return;
    update(s => {
      const ps = {};
      forRange((r, c, key) => {
        const sr = dir === 'down' ? rg.r1 : r; const sc = dir === 'down' ? c : rg.c1;
        if (r === sr && c === sc) return;
        const x = s.cells[keyOf(sr, sc)] || {};
        const v = String(x.v || '').startsWith('=') ? `=${shiftRel(String(x.v).slice(1), r - sr, c - sc)}` : (x.v || '');
        ps[key] = { ...x, v };
        Object.keys(s.cells[key] || {}).forEach(f => { if (!(f in ps[key])) ps[key][f] = ''; });
      });
      return putCells(s, ps);
    });
  };
  const sortRows = dir => {
    commit();
    const r1 = rg.r1; const r2 = multi ? rg.r2 : (() => { let e = r1; while (e + 1 < sheet.rows && Object.keys(sheet.cells).some(key => parseKey(key).r === e + 1)) e += 1; return e; })();
    if (r2 <= r1) return;
    const c1 = multi ? rg.c1 : 0; const c2 = multi ? rg.c2 : sheet.cols - 1;
    update(s => {
      const rows = []; for (let r = r1; r <= r2; r += 1) { const row = {}; for (let c = c1; c <= c2; c += 1) row[c] = s.cells[keyOf(r, c)]; rows.push({ row, key: ev.get(keyOf(r, sel.c)) }); }
      rows.sort((a, b) => { const x = a.key; const y = b.key; const ex = x === '' || x == null; const ey = y === '' || y == null; if (ex || ey) return ex - ey; if (typeof x === 'number' && typeof y === 'number') return dir * (x - y); if (typeof x === 'number') return -1; if (typeof y === 'number') return 1; return dir * String(x).localeCompare(String(y), 'en', { numeric: true }); });
      const cells = { ...s.cells };
      rows.forEach((o, i) => { for (let c = c1; c <= c2; c += 1) { const key = keyOf(r1 + i, c); if (o.row[c]) cells[key] = o.row[c]; else delete cells[key]; } });
      return { ...s, cells };
    });
  };
  const autoSum = (fn = 'SUM') => {
    commit();
    if (multi) {
      const c = rg.c1; const below = rg.r2 + 1;
      update(s => { const ps = {}; for (let cc = rg.c1; cc <= rg.c2; cc += 1) { const up = s.cells[keyOf(rg.r2, cc)] || {}; ps[keyOf(below, cc)] = { v: `=${fn}(${keyOf(rg.r1, cc)}:${keyOf(rg.r2, cc)})`, b: 1, ...(up.nf ? { nf: up.nf } : {}), ...(up.dp != null ? { dp: up.dp } : {}) }; } const n2 = putCells(s, ps); return below >= s.rows ? { ...n2, rows: below + 10 } : n2; });
      setSel({ r: below, c }); setFoc({ r: below, c });
      return;
    }
    let top = sel.r - 1; while (top >= 0 && typeof ev.get(keyOf(top, sel.c)) === 'number') top -= 1;
    if (top < sel.r - 1) update(s => { const up = s.cells[keyOf(sel.r - 1, sel.c)] || {}; return putCells(s, { [k]: { v: `=${fn}(${keyOf(top + 1, sel.c)}:${keyOf(sel.r - 1, sel.c)})`, ...(up.nf && !cell.nf ? { nf: up.nf } : {}) } }); });
    else insertFn(fn);
  };
  const insertFn = fn => { setEdit(`=${fn}(`, 'bar'); setTimeout(() => { const el = fxIn.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); };
  const decimals = d => fmtRange(x => { const dp0 = x.dp ?? (x.nf === 'pct' ? 0 : 2); return { dp: Math.min(6, Math.max(0, dp0 + d)), nf: x.nf || 'plain' }; });

  /* clipboard: copy / cut / paste (also from Excel / Google Sheets as text) */
  const rangeText = () => { const lines = []; for (let r = rg.r1; r <= rg.r2; r += 1) { const row = []; for (let c = rg.c1; c <= rg.c2; c += 1) row.push(String(sheet.cells[keyOf(r, c)]?.v ?? '')); lines.push(row.join('\t')); } return lines.join('\n'); };
  const onCopy = (e, cut) => {
    if (edit != null) return;
    e.preventDefault();
    const text = rangeText();
    e.clipboardData.setData('text/plain', text);
    const cells = []; for (let r = rg.r1; r <= rg.r2; r += 1) { const row = []; for (let c = rg.c1; c <= rg.c2; c += 1) row.push(sheet.cells[keyOf(r, c)] || null); cells.push(row); }
    clip.current = { text, cells, r: rg.r1, c: rg.c1, cut };
    if (cut) clear('all');
  };
  const onPaste = e => {
    if (edit != null) return;
    const t = e.clipboardData?.getData('text/plain'); if (t == null) return;
    e.preventDefault();
    const own = clip.current && clip.current.text === t ? clip.current : null;
    const rows = own ? own.cells : t.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(l => l.split('\t').map(v => ({ v: v.trim() })));
    update(s => {
      const ps = {};
      rows.forEach((row, i) => row.forEach((x, j) => {
        const key = keyOf(sel.r + i, sel.c + j);
        const y = x ? { ...x } : {};
        if (own && !own.cut && String(y.v || '').startsWith('=')) y.v = `=${shiftRel(String(y.v).slice(1), sel.r - own.r, sel.c - own.c)}`;
        if (!x || own) Object.keys(s.cells[key] || {}).forEach(f => { if (!(f in y)) y[f] = ''; });
        ps[key] = y;
      }));
      const n2 = putCells(s, ps);
      return { ...n2, rows: Math.min(1000, Math.max(s.rows, sel.r + rows.length + 5)), cols: Math.min(52, Math.max(s.cols, sel.c + Math.max(...rows.map(r => r.length)))) };
    });
    setFoc({ r: sel.r + rows.length - 1, c: sel.c + Math.max(...rows.map(r => r.length)) - 1 });
  };

  const onKey = e => {
    const c = e.ctrlKey || e.metaKey; const key = e.key.toLowerCase();
    if (edit != null) {
      if (e.key === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0); } else if (e.key === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') { setEdit(null); point.current = null; grid.current?.focus(); }
      return;
    }
    if (c && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (c && key === 'y') { e.preventDefault(); redo(); return; }
    if (c && key === 'b') { e.preventDefault(); toggle('b'); return; }
    if (c && key === 'i') { e.preventDefault(); toggle('i'); return; }
    if (c && key === 'u') { e.preventDefault(); toggle('u'); return; }
    if (c && key === 's') { e.preventDefault(); saveClick(); return; }
    if (c && key === 'a') { e.preventDefault(); selAll(); return; }
    if (c && key === 'd') { e.preventDefault(); fill('down'); return; }
    if (c && key === 'r') { e.preventDefault(); fill('right'); return; }
    if (c || e.altKey) return;
    const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (mv) { e.preventDefault(); move(mv[0], mv[1], e.shiftKey); return; }
    if (e.key === 'Enter') { e.preventDefault(); move(e.shiftKey ? -1 : 1, 0); return; }
    if (e.key === 'Tab') { e.preventDefault(); move(0, e.shiftKey ? -1 : 1); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); clear('v'); return; }
    if (e.key === 'F2') { e.preventDefault(); setEdit(String(cell.v || ''), 'cell'); return; }
    if (e.key.length === 1) { e.preventDefault(); setFoc(sel); setEdit(e.key, 'cell'); }
  };
  const used = () => {
    let R = 0; let C = 0;
    Object.entries(sheet.cells).forEach(([key, x]) => { const p = parseKey(key); if (p && (String(x.v ?? '') !== '' || x.bg || x.bd)) { R = Math.max(R, p.r + 1); C = Math.max(C, p.c + 1); } });
    merges.rects.forEach(x => { R = Math.max(R, x.r2 + 1); C = Math.max(C, x.c2 + 1); });
    return { R, C };
  };
  const importX = async e => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    if (dirty && !window.confirm('Replace this sheet with the file?')) return;
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellFormula: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rgx = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const cells = {};
      for (let r = rgx.s.r; r <= Math.min(rgx.e.r, 999); r += 1) for (let c = rgx.s.c; c <= Math.min(rgx.e.c, 51); c += 1) {
        const x = ws[XLSX.utils.encode_cell({ r, c })]; if (!x) continue;
        const v = x.f ? `=${x.f}` : (x.t === 'n' ? String(x.v) : (x.w ?? (x.v != null ? String(x.v) : '')));
        const y = {}; if (v !== '') y.v = String(v);
        if (x.t === 'n' && x.z) { if (/%/.test(x.z)) y.nf = 'pct'; else if (/₹|Rs/i.test(x.z)) y.nf = 'inr'; else if (/#,##/.test(x.z)) y.nf = 'num'; const dp = (/\.(0+)/.exec(x.z) || [])[1]; if (y.nf && dp != null) y.dp = dp.length; }
        if (Object.keys(y).length) cells[keyOf(r, c)] = y;
      }
      const widths = {}; (ws['!cols'] || []).forEach((cw, i) => { const px = cw?.wpx || (cw?.wch ? cw.wch * 7.5 : 0); if (px && i < 52) widths[colName(i)] = Math.round(Math.min(600, Math.max(30, px))); });
      const mg = (ws['!merges'] || []).filter(x => x.s.c < 52).map(x => `${keyOf(x.s.r, x.s.c)}:${keyOf(x.e.r, Math.min(51, x.e.c))}`);
      update(() => ({ ...blankSheet(), rows: Math.max(50, Math.min(1000, rgx.e.r + 10)), cols: Math.max(15, Math.min(52, rgx.e.c + 3)), cells, widths, merges: mg }));
      setNote(`Opened ${f.name} — first sheet. Colours and borders of the file are not read.`);
    } catch { act.setErr('Could not read that Excel file.'); }
  };
  const exportX = async () => {
    const XLSX = await import('xlsx');
    const { R, C } = used();
    const ws = {};
    for (let r = 0; r < R; r += 1) for (let c = 0; c < C; c += 1) {
      const key = keyOf(r, c); const x = sheet.cells[key]; const raw = x?.v; if (raw == null || raw === '') continue;
      const v = ev.get(key);
      const z = x.nf === 'num' ? `#,##0${x.dp ?? 2 ? `.${'0'.repeat(x.dp ?? 2)}` : ''}` : x.nf === 'inr' ? `"₹" #,##0${x.dp ?? 2 ? `.${'0'.repeat(x.dp ?? 2)}` : ''}` : x.nf === 'pct' ? `0${x.dp ? `.${'0'.repeat(x.dp)}` : ''}%` : x.nf === 'plain' ? `0${x.dp ?? 2 ? `.${'0'.repeat(x.dp ?? 2)}` : ''}` : undefined;
      ws[key] = String(raw).startsWith('=') ? { t: typeof v === 'number' ? 'n' : 's', v, f: String(raw).slice(1) } : (x.nf !== 'text' && isNum(raw)) ? { t: 'n', v: num(raw) } : { t: 's', v: String(raw) };
      if (z && ws[key].t === 'n') ws[key].z = z;
    }
    ws['!ref'] = `A1:${keyOf(Math.max(0, R - 1), Math.max(0, C - 1))}`;
    ws['!cols'] = Array.from({ length: C }, (_, c) => ({ wpx: W(c) }));
    ws['!merges'] = (sheet.merges || []).map(mg => XLSX.utils.decode_range(mg));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${(doc?.title || 'Sheet').replace(/[\\/:*?"<>|]+/g, '-')}.xlsx`);
  };
  const doSave = async link => {
    commit();
    const d = await act.save({ docId: doc?.docId, letterheadId: lhId, landscape, sheet: cur.current, title: link?.title || doc?.title, ...(link || { orderId: doc.orderId, orderNo: doc.orderNo, clientId: doc.clientId, clientName: doc.clientName }) });
    if (d) setAsking(false);
    return d;
  };
  const saveClick = () => (doc ? doSave(null) : setAsking(true));
  const makePdf = async () => {
    let d = doc;
    if (!d) { setAsking(true); return; }
    if (dirty || edit != null) { d = await doSave(null); if (!d) return; }
    const { R, C } = used();
    if (!R) { act.setErr('The sheet is empty.'); return; }
    const tw = Array.from({ length: C }, (_, c) => W(c)).reduce((a, b) => a + b, 0);
    const cg = `<colgroup>${Array.from({ length: C }, (_, c) => `<col style="width:${(W(c) / tw * 100).toFixed(3)}%">`).join('')}</colgroup>`;
    const rows = Array.from({ length: R }, (_, r) => `<tr${sheet.heights[r] ? ` style="height:${sheet.heights[r] * 0.75}pt"` : ''}>${Array.from({ length: C }, (_, c) => {
      const key = keyOf(r, c); if (merges.hidden.has(key)) return '';
      const x = sheet.cells[key]; const v = x ? ev.get(key) : ''; const mg = merges.master[key];
      return `<td${mg ? `${mg.rs > 1 ? ` rowspan="${mg.rs}"` : ''}${mg.cs > 1 ? ` colspan="${mg.cs}"` : ''}` : ''} style="${cssText(cellCss(x, typeof v === 'number'))}">${esc(fmtVal(v, x))}</td>`;
    }).join('')}</tr>`).join('');
    const head = `<div class="xh"><b>${esc(d.title)}</b><span>${esc([d.clientName, d.orderNo && `Order ${d.orderNo}`].filter(Boolean).join(' · '))}</span></div>`;
    act.pdf(d, pageHtml(`${head}<table class="xs${sheet.grid !== false ? ' g' : ''}">${cg}<tbody>${rows}</tbody></table>`, m, { landscape, title: d.title }));
  };
  const viewPdf = async () => {
    try {
      const r = await axios.get(`/api/office/docs/${doc.docId}/pdf`, { params: { companyId }, responseType: 'blob' });
      openPreview(doc.title, { pdfUrl: URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })), fileName: `${[doc.clientName, doc.title].filter(Boolean).join(' - ')}.pdf` });
    } catch (e) { act.setErr(await blobErr(e, 'Could not open the PDF.')); }
  };
  const stats = useMemo(() => {
    if (!multi) return null;
    let n = 0; let s = 0; let filled = 0;
    for (let r = rg.r1; r <= rg.r2 && r < sheet.rows; r += 1) for (let c = rg.c1; c <= rg.c2; c += 1) { const v = sheet.cells[keyOf(r, c)] ? ev.get(keyOf(r, c)) : ''; if (v !== '') filled += 1; if (typeof v === 'number') { n += 1; s += v; } }
    return { n, s, filled, avg: n ? s / n : 0 };
  }, [multi, rg.r1, rg.r2, rg.c1, rg.c2, ev, sheet.cells, sheet.rows]);
  const st = act.busy === 'save' ? ['', 'Saving…'] : dirty ? ['dirty', 'Not saved'] : doc?.signedAt ? ['ok', `✓ Signed PDF · ${doc.signedBy}`] : doc?.pdfAt ? ['ok', '✓ PDF made'] : doc ? ['ok', 'Saved'] : ['', 'New sheet'];
  const rowItems = [{ label: 'Insert row above', onClick: () => insRows(false) }, { label: 'Insert row below', onClick: () => insRows(true) }, { label: `Delete row${rg.r2 > rg.r1 ? `s ${rg.r1 + 1}–${rg.r2 + 1}` : ` ${rg.r1 + 1}`}`, onClick: delRows },
    '-', { label: 'Taller row', onClick: () => update(s => { const h = { ...s.heights }; for (let r = rg.r1; r <= rg.r2; r += 1) h[r] = Math.min(300, (h[r] || 22) + 8); return { ...s, heights: h }; }) },
    { label: 'Normal row height', onClick: () => update(s => { const h = { ...s.heights }; for (let r = rg.r1; r <= rg.r2; r += 1) delete h[r]; return { ...s, heights: h }; }) },
    { label: '+ 10 rows at the end', onClick: () => update(s => ({ ...s, rows: Math.min(1000, s.rows + 10) })) }];
  const colItems = [{ label: 'Insert column left', onClick: () => insCols(false) }, { label: 'Insert column right', onClick: () => insCols(true) }, { label: `Delete column${rg.c2 > rg.c1 ? `s ${colName(rg.c1)}–${colName(rg.c2)}` : ` ${colName(rg.c1)}`}`, onClick: delCols },
    '-', { label: 'Wider column', onClick: () => update(s => { const w = { ...s.widths }; for (let c = rg.c1; c <= rg.c2; c += 1) w[colName(c)] = Math.min(600, (w[colName(c)] || 100) + 30); return { ...s, widths: w }; }) },
    { label: 'Narrower column', onClick: () => update(s => { const w = { ...s.widths }; for (let c = rg.c1; c <= rg.c2; c += 1) w[colName(c)] = Math.max(30, (w[colName(c)] || 100) - 30); return { ...s, widths: w }; }) },
    { label: 'Fit width to text', onClick: () => update(s => { const w = { ...s.widths }; for (let c = rg.c1; c <= rg.c2; c += 1) { let mx = 40; for (let r = 0; r < s.rows; r += 1) { const x = s.cells[keyOf(r, c)]; if (x && !merges.hidden.has(keyOf(r, c)) && !merges.master[keyOf(r, c)]) mx = Math.max(mx, fmtVal(ev.get(keyOf(r, c)), x).length * 7.2 * ((x.fs || 9.5) / 9.5) + 12); } w[colName(c)] = Math.round(Math.min(600, mx)); } return { ...s, widths: w }; }) },
    { label: '+ 1 column at the end', onClick: () => update(s => ({ ...s, cols: Math.min(52, s.cols + 1) })) }];

  return (<>
    <div className="of-bar">
      <select value={lhId} onChange={e => { setLhId(e.target.value); setDirty(true); }} aria-label="Letterhead for the PDF" title="Letterhead for the PDF">
        <option value="">PDF: no letterhead</option>{letterheads.map(x => <option key={x.id} value={x.id}>PDF on {x.name}</option>)}
      </select>
      <Tb title="PDF page across (landscape)" on={landscape} onClick={() => { setLandscape(v => !v); setDirty(true); }}>Landscape</Tb>
      <Tb title="Print the grid lines in the PDF" on={sheet.grid !== false} onClick={() => update(s => ({ ...s, grid: s.grid === false }))}>Grid lines</Tb>
      <Tb title="Open an Excel file (.xlsx, .xls, .csv)" onClick={() => fileRef.current?.click()}>Import .xlsx</Tb>
      <Tb title="Download as an Excel file" onClick={exportX}>Export .xlsx</Tb>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={importX} />
      {doc && <span className="of-link">For <b>{doc.orderNo ? `SO ${doc.orderNo}` : doc.clientName}</b>{doc.orderNo && <> · {doc.clientName}</>}<button type="button" className="of-ib" onClick={() => setAsking(true)} title="Change the name / order">✎</button></span>}
      <span className="sp" />
      <span className={`of-state ${st[0]}`}>{st[1]}</span>
      <button type="button" className="of-ib pri" onClick={saveClick} disabled={!!act.busy}><Svg name="check" size={13} />Save</button>
      <button type="button" className="of-ib" onClick={() => makePdf()} disabled={!!act.busy}>{act.busy === 'pdf' ? 'Making…' : 'Make PDF'}</button>
      <button type="button" className="of-ib" onClick={() => setSigning(true)} disabled={!!act.busy || !doc?.pdfAt || dirty} title={doc?.pdfAt && !dirty ? 'Place your signature anywhere on the PDF' : 'Save and make the PDF first'}>✍ Sign</button>
      <button type="button" className="of-ib" onClick={viewPdf} disabled={!doc?.pdfAt || dirty}>View PDF</button>
    </div>

    <div className="of-bar of-tools" role="toolbar" aria-label="Formatting">
      <div className="of-grp">
        <Tb title="Undo (Ctrl+Z)" onClick={undo} disabled={!past.current.length}>↺</Tb>
        <Tb title="Redo (Ctrl+Y)" onClick={redo} disabled={!future.current.length}>↻</Tb>
      </div>
      <div className="of-grp">
        <select className="sz" value={cell.fs || ''} onChange={e => fmtRange({ fs: e.target.value ? +e.target.value : '' })} aria-label="Font size" title="Font size">
          <option value="">9.5</option>{XL_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <Tb title="Bold (Ctrl+B)" on={cell.b} onClick={() => toggle('b')}><b>B</b></Tb>
        <Tb title="Italic (Ctrl+I)" on={cell.i} onClick={() => toggle('i')}><i style={{ fontFamily: 'Georgia, serif' }}>I</i></Tb>
        <Tb title="Underline (Ctrl+U)" on={cell.u} onClick={() => toggle('u')}><u>U</u></Tb>
        <Tb title="Strikethrough" on={cell.s} onClick={() => toggle('s')}><s>ab</s></Tb>
        <ColorMenu title="Font colour" icon={<IcoA k="fc" />} color={fc} noneLabel="Automatic (black)" onPick={c => { if (c) setFc(c); fmtRange({ fc: c }); }} />
        <ColorMenu title="Fill colour" icon={<span className="of-ia fill">◧</span>} color={bg} noneLabel="No fill" onPick={c => { if (c) setBg(c); fmtRange({ bg: c }); }} />
      </div>
      <div className="of-grp">
        {[['l', 'Align left'], ['c', 'Centre'], ['r', 'Align right']].map(([a, l]) => <Tb key={a} title={l} on={cell.a === a} onClick={() => fmtRange({ a: cell.a === a ? '' : a })}><AlignIco a={a} /></Tb>)}
        {[['t', 'Top', '⤒'], ['m', 'Middle', '↕'], ['b', 'Bottom', '⤓']].map(([a, l, t]) => <Tb key={a} title={`${l} align`} on={cell.va === a} onClick={() => fmtRange({ va: cell.va === a ? '' : a })}>{t}</Tb>)}
        <Tb title="Wrap text — long text on more lines" on={cell.wr} onClick={() => toggle('wr')}>Wrap</Tb>
        <Tb title="Merge & centre the selected cells (click again to unmerge)" on={anyMerge} onClick={mergeToggle} disabled={!multi && !anyMerge}>Merge</Tb>
      </div>
      <div className="of-grp">
        <select className="nf" value={cell.nf || ''} onChange={e => fmtRange({ nf: e.target.value })} aria-label="Number format" title="Number format">{XL_FMT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <Tb title="Rupees ₹ 1,23,456.00" on={cell.nf === 'inr'} onClick={() => fmtRange({ nf: cell.nf === 'inr' ? '' : 'inr' })}>₹</Tb>
        <Tb title="Percent" on={cell.nf === 'pct'} onClick={() => fmtRange({ nf: cell.nf === 'pct' ? '' : 'pct' })}>%</Tb>
        <Tb title="Comma style 1,23,456.00" on={cell.nf === 'num'} onClick={() => fmtRange({ nf: cell.nf === 'num' ? '' : 'num' })}>,</Tb>
        <Tb title="More decimal places" onClick={() => decimals(1)}>.0<sup>+</sup></Tb>
        <Tb title="Fewer decimal places" onClick={() => decimals(-1)}>.0<sup>−</sup></Tb>
      </div>
      <div className="of-grp">
        <Menu label="Borders" title="Borders of the selected cells" items={[
          { label: 'All borders', onClick: () => borders('all') }, { label: 'Outside borders', onClick: () => borders('out') },
          { label: 'Inside horizontal', onClick: () => borders('inh') }, { label: 'Inside vertical', onClick: () => borders('inv') }, '-',
          { label: 'Top border', onClick: () => borders('t') }, { label: 'Bottom border', onClick: () => borders('b') },
          { label: 'Left border', onClick: () => borders('l') }, { label: 'Right border', onClick: () => borders('r') }, '-',
          { label: 'No border', onClick: () => borders('none') }]} />
        <Menu label="Rows" title="Insert / delete rows" items={rowItems} />
        <Menu label="Columns" title="Insert / delete columns" items={colItems} />
      </div>
      <div className="of-grp" style={{ borderRight: 0 }}>
        <Tb title="AutoSum — select the numbers (or click below them) and press" onClick={() => autoSum('SUM')}>Σ Sum</Tb>
        <Menu label="fx" title="Insert a function" wide items={[
          { label: 'SUM', hint: 'total', onClick: () => insertFn('SUM') }, { label: 'AVERAGE', hint: 'average', onClick: () => insertFn('AVERAGE') },
          { label: 'MIN', hint: 'smallest', onClick: () => insertFn('MIN') }, { label: 'MAX', hint: 'largest', onClick: () => insertFn('MAX') },
          { label: 'COUNT', hint: 'how many numbers', onClick: () => insertFn('COUNT') }, { label: 'COUNTA', hint: 'how many filled', onClick: () => insertFn('COUNTA') },
          { label: 'PRODUCT', hint: 'multiply all', onClick: () => insertFn('PRODUCT') }, { label: 'ROUND', hint: 'ROUND(A1, 2)', onClick: () => insertFn('ROUND') },
          { label: 'ROUNDUP / ROUNDDOWN', hint: 'ROUNDUP(A1, 0)', onClick: () => insertFn('ROUNDUP') }, { label: 'IF', hint: 'IF(A1>100, A1*0.9, A1)', onClick: () => insertFn('IF') },
          { label: 'ABS / INT / SQRT / MOD / POWER', hint: 'maths', onClick: () => insertFn('ABS') }]} />
        <Menu label="Fill" title="Fill the selection" items={[{ label: 'Fill down (Ctrl+D)', hint: 'copies the top cell down, formulas follow', onClick: () => fill('down') }, { label: 'Fill right (Ctrl+R)', hint: 'copies the left cell across', onClick: () => fill('right') }]} />
        <Menu label="Sort" title="Sort the rows by the column of the active cell" items={[{ label: 'Sort A → Z / small → large', onClick: () => sortRows(1) }, { label: 'Sort Z → A / large → small', onClick: () => sortRows(-1) }]} />
        <Menu label="Clear" title="Clear the selected cells" items={[{ label: 'Clear contents', hint: 'Delete', onClick: () => clear('v') }, { label: 'Clear formats', onClick: () => clear('f') }, { label: 'Clear all', onClick: () => clear('all') }]} />
      </div>
    </div>
    {act.err && <div className="sb-ask"><span>{act.err}</span><button type="button" className="sb-abtn" onClick={() => act.setErr('')}>OK</button></div>}
    <div className="of-fx">
      <b>{multi ? `${keyOf(rg.r1, rg.c1)}:${keyOf(rg.r2, rg.c2)}` : k}</b>
      <span className="fx">fx</span>
      <input ref={fxIn} value={edit != null ? edit : String(cell.v || '')} aria-label="Cell value or formula" placeholder="Type a value, or a formula like =SUM(B2:B10) or =B2*C2"
        onFocus={() => { if (edit == null) setEdit(String(cell.v || ''), 'bar'); else setSrc('bar'); }}
        onChange={e => setEdit(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); move(1, 0); } else if (e.key === 'Tab') { e.preventDefault(); move(0, 1); } else if (e.key === 'Escape') { setEdit(null); grid.current?.focus(); } }} />
    </div>
    <div className="of-xl" ref={grid} tabIndex={0} onKeyDown={onKey} onPaste={onPaste} onCopy={e => onCopy(e, false)} onCut={e => onCopy(e, true)}
      onContextMenu={e => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}>
      <table style={{ width: 44 + Array.from({ length: sheet.cols }, (_, c) => W(c)).reduce((a, b) => a + b, 0) }}>
        <colgroup><col style={{ width: 44 }} />{Array.from({ length: sheet.cols }, (_, c) => <col key={c} style={{ width: W(c) }} />)}</colgroup>
        <thead><tr>
          <th className="rh corner" onMouseDown={selAll} title="Select all" />
          {Array.from({ length: sheet.cols }, (_, c) => (
            <th key={c} className={`ch${c >= rg.c1 && c <= rg.c2 ? ' on' : ''}`} onMouseDown={e => { if (e.button === 0) selCol(c, e); }}>
              {colName(c)}<i className="rz" onMouseDown={e => { e.stopPropagation(); e.preventDefault(); drag.current = { kind: 'col', i: c, x0: e.clientX, v0: W(c), snap: cur.current }; }} />
            </th>))}
        </tr></thead>
        <tbody>{Array.from({ length: sheet.rows }, (_, r) => (
          <tr key={r} style={sheet.heights[r] ? { height: H(r) } : undefined}>
            <td className={`rh${r >= rg.r1 && r <= rg.r2 ? ' on' : ''}`} onMouseDown={e => { if (e.button === 0) selRow(r, e); }}>
              {r + 1}<i className="rzh" onMouseDown={e => { e.stopPropagation(); e.preventDefault(); drag.current = { kind: 'row', i: r, y0: e.clientY, v0: H(r), snap: cur.current }; }} />
            </td>
            {Array.from({ length: sheet.cols }, (_, c) => {
              const key = keyOf(r, c);
              if (merges.hidden.has(key)) return null;
              const mg = merges.master[key];
              const x = sheet.cells[key]; const anchor = r === sel.r && c === sel.c;
              const span = mg ? { rowSpan: mg.rs, colSpan: mg.cs } : {};
              if (anchor && edit != null) return <td key={c} {...span} className="c sel ed" style={cellCss(x)}><input autoFocus={src === 'cell'} value={edit} onChange={e => setEdit(e.target.value)} onBlur={e => { if (!grid.current?.contains(e.relatedTarget) && e.relatedTarget !== fxIn.current) commit(); }} aria-label={key} /></td>;
              const v = x ? ev.get(key) : '';
              const err = typeof v === 'string' && v.startsWith('#');
              const cls = ['c', anchor ? 'sel' : inRg(r, c) && multi ? 'rg' : '', err ? 'er' : '', x?.wr ? 'wr' : ''].filter(Boolean).join(' ');
              return <td key={c} {...span} className={cls} style={cellCss(x, typeof v === 'number')} onMouseDown={e => pickCell(e, r, c)} onMouseEnter={() => enterCell(r, c)}
                onDoubleClick={() => setEdit(String(x?.v || ''), 'cell')} title={x?.v && String(x.v).startsWith('=') ? x.v : undefined}>{fmtVal(v, x)}</td>;
            })}
          </tr>
        ))}</tbody>
      </table>
    </div>
    <div className="of-status">
      {stats ? <><span>Count {stats.filled}</span>{stats.n > 0 && <><span>Sum <b>{stats.s.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b></span><span>Average <b>{stats.avg.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b></span></>}</> : <span>{cell.v && String(cell.v).startsWith('=') ? `Formula: ${cell.v}` : 'Tip: select cells to see their total · right-click for rows / columns · Ctrl+D fills down'}</span>}
      <span className="sp" /><span>{sheet.rows} rows × {sheet.cols} columns</span>
    </div>
    {ctx && createPortal(
      <div className="of-pop of-menu of-ctxm" style={{ left: Math.min(ctx.x, window.innerWidth - 230), top: Math.min(ctx.y, window.innerHeight - 420) }} onMouseDown={e => e.stopPropagation()} role="menu">
        {[...rowItems.slice(0, 3), '-', ...colItems.slice(0, 3), '-', { label: anyMerge ? 'Unmerge cells' : 'Merge & centre', onClick: mergeToggle, disabled: !multi && !anyMerge },
          { label: 'Clear contents', onClick: () => clear('v') }, { label: 'Clear formats', onClick: () => clear('f') }, '-',
          { label: 'Sort A → Z', onClick: () => sortRows(1) }, { label: 'Sort Z → A', onClick: () => sortRows(-1) }].map((it, i) => (it === '-' ? <hr key={i} /> : (
          <button key={i} type="button" role="menuitem" disabled={it.disabled} onClick={() => { setCtx(null); it.onClick(); grid.current?.focus(); }}><span>{it.label}</span></button>)))}
      </div>, document.body)}
    {signing && doc && <SignPlacer doc={doc} companyId={companyId} onClose={() => setSigning(false)} onSigned={blob => { setSigning(false); act.signed(doc, blob); }} />}
    {asking && <SaveDialog init={doc || { title: 'Sheet' }} orders={orders} clients={clients} busy={act.busy === 'save'} err={act.err}
      onCancel={() => { setAsking(false); act.setErr(''); }} onSave={doSave} />}
  </>);
}

/* ───────── Letterheads ───────── */
function Letterheads({ companyId, list, reload, setNote }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [edits, setEdits] = useState({});
  const upload = async e => {
    const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
    const name = window.prompt('Name of this letterhead', f.name.replace(/\.\w+$/, '')); if (name == null) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('name', name); fd.append('companyId', companyId);
      await axios.post('/api/office/letterheads', fd, { params: { companyId } });
      setNote(`Letterhead “${name}” added — set the writing margins below if the text touches the logo or footer.`); reload();
    } catch (x) { setErr(errOf(x, 'Could not upload the letterhead.')); } finally { setBusy(false); }
  };
  const saveM = async lh => {
    try { await axios.put(`/api/office/letterheads/${lh.id}`, { companyId, ...lh, ...edits[lh.id] }); setEdits(x => ({ ...x, [lh.id]: undefined })); setNote(`Margins of “${lh.name}” saved.`); reload(); }
    catch (x) { setErr(errOf(x, 'Could not save.')); }
  };
  const del = async lh => {
    if (!window.confirm(`Remove the letterhead “${lh.name}”? Letters already made keep their PDF.`)) return;
    try { await axios.delete(`/api/office/letterheads/${lh.id}`, { params: { companyId } }); reload(); } catch (x) { setErr(errOf(x, 'Could not remove.')); }
  };
  return (<>
    <div className="of-bar">
      <span style={{ fontSize: 12.5, color: '#475467' }}>Upload the letterhead as a <b>PDF</b> (best — sharp print) or a picture (PNG / JPG) of a full A4 page. Margins are where the writing starts, in mm from the page edge.</span>
      <span className="sp" />
      <button type="button" className="of-ib pri" onClick={() => fileRef.current?.click()} disabled={busy}><Svg name="plus" size={13} />{busy ? 'Uploading…' : 'Upload letterhead'}</button>
      <input ref={fileRef} type="file" accept=".pdf,image/png,image/jpeg" hidden onChange={upload} />
    </div>
    {err && <div className="sb-ask"><span>{err}</span><button type="button" className="sb-abtn" onClick={() => setErr('')}>OK</button></div>}
    <div className="sb-body">
      {!list.length ? <div className="sb-empty">No letterhead yet — upload the company letterhead PDF.</div> : (
        <div className="of-lh">{list.map(lh => {
          const e = { ...lh, ...(edits[lh.id] || {}) };
          const set = (f, v) => setEdits(x => ({ ...x, [lh.id]: { ...(x[lh.id] || {}), [f]: v } }));
          return (
            <div key={lh.id} className="of-lhc">
              <img src={`/api/office/letterheads/${lh.id}/preview`} alt={lh.name} />
              <div className="b">
                <b>{lh.name}</b><span style={{ color: '#667085', fontSize: 11 }}>{lh.type.toUpperCase()} · added by {lh.addedBy} · {dmy(lh.addedAt)}</span>
                <div className="m">{['top', 'bottom', 'left', 'right'].map(f => <label key={f}>{f[0].toUpperCase() + f.slice(1)}<input type="number" min="0" max="120" value={e[f]} onChange={x => set(f, x.target.value)} /></label>)}</div>
                <div className="r">
                  <button type="button" className="of-ib pri" disabled={!edits[lh.id]} onClick={() => saveM(lh)}>Save margins</button>
                  <button type="button" className="of-ib" onClick={() => del(lh)}>Remove</button>
                </div>
              </div>
            </div>
          );
        })}</div>
      )}
    </div>
  </>);
}

/* ───────── Documents list ───────── */
function Documents({ companyId, user, docs, reload, navigate, setNote }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [sel, setSel] = useState(null);
  const [err, setErr] = useState('');
  const w = words(q);
  const list = (docs || []).filter(d => (!kind || d.kind === kind) && hit(`${d.title} ${d.letterType} ${d.clientName} ${d.orderNo} ${d.createdBy} ${d.updatedBy}`, w));
  const cur = list.find(d => d.docId === sel) || null;
  const open = d => navigate(`/beta/office/${d.kind}?id=${d.docId}`);
  const viewPdf = async d => {
    try {
      const r = await axios.get(`/api/office/docs/${d.docId}/pdf`, { params: { companyId }, responseType: 'blob' });
      openPreview(d.title, { pdfUrl: URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' })), fileName: `${[d.clientName, d.title].filter(Boolean).join(' - ')}.pdf` });
    } catch (e) { setErr(await blobErr(e, 'Could not open the PDF.')); }
  };
  const del = async d => {
    if (!window.confirm(`Delete “${d.title}”?`)) return;
    try { await axios.delete(`/api/office/docs/${d.docId}`, { params: { companyId } }); setSel(null); setNote(`Deleted “${d.title}”.`); reload(); }
    catch (e) { setErr(errOf(e, 'Could not delete.')); }
  };
  const canDel = d => d && (String(d.createdById) === String(user?.id) || user?.role === 'admin');
  return (<>
    <div className="sb-bar">
      <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, client, order no…" aria-label="Search documents" />
      {[['', 'All'], ['word', 'Word'], ['excel', 'Excel']].map(([k, l]) => <button key={k} type="button" className={`sb-chk${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{l} <small>{(docs || []).filter(d => !k || d.kind === k).length}</small></button>)}
      <div className="sb-tools">
        {cur && <span className="sb-picked"><b>{cur.title}</b></span>}
        <button type="button" className="sb-tbtn" disabled={!cur} onClick={() => open(cur)}>Open</button>
        <button type="button" className="sb-tbtn" disabled={!cur?.hasPdf} onClick={() => viewPdf(cur)}>View PDF</button>
        <button type="button" className="sb-tbtn del" disabled={!canDel(cur)} onClick={() => del(cur)}>Delete</button>
      </div>
    </div>
    {err && <div className="sb-ask"><span>{err}</span><button type="button" className="sb-abtn" onClick={() => setErr('')}>OK</button></div>}
    <div className="sb-list">
      <table className="sb-t">
        <colgroup><col style={{ width: '8%' }} /><col style={{ width: '4%' }} /><col style={{ width: '24%' }} /><col style={{ width: '11%' }} /><col style={{ width: '20%' }} /><col style={{ width: '11%' }} /><col style={{ width: '10%' }} /><col style={{ width: '12%' }} /></colgroup>
        <thead><tr><th>Updated</th><th className="c">Type</th><th>Name</th><th>Letter Type</th><th>Client</th><th>Order No.</th><th>PDF</th><th>Made By</th></tr></thead>
        {docs == null ? <tbody><tr><td colSpan={8} className="sb-empty">Loading…</td></tr></tbody>
          : !list.length ? <tbody><tr><td colSpan={8} className="sb-empty">{docs.length ? 'Nothing matches.' : 'No document yet — start a letter in Word or a sheet in Excel.'}</td></tr></tbody>
          : list.map(d => (
            <tbody key={d.docId} className={`og${sel === d.docId ? ' sel' : ''}`} onClick={() => setSel(d.docId)} onDoubleClick={() => open(d)}>
              <tr>
                <td className="nw">{dmy(d.updatedAt)}</td>
                <td className="c"><span className="of-kd" style={{ background: d.kind === 'word' ? '#2B579A' : '#217346' }}>{d.kind === 'word' ? 'W' : 'X'}</span></td>
                <td className="cl">{d.title}</td>
                <td>{d.kind === 'word' ? d.letterType : 'Sheet'}</td>
                <td>{d.clientName}</td>
                <td className="no">{d.orderNo || <span className="mut">—</span>}</td>
                <td>{d.signedAt ? <span className="done">✓ Signed</span> : d.hasPdf ? 'Made' : <span className="mut">—</span>}</td>
                <td>{d.createdBy}{d.updatedBy && d.updatedBy !== d.createdBy && <span className="mut"> · {d.updatedBy}</span>}</td>
              </tr>
            </tbody>
          ))}
      </table>
    </div>
  </>);
}

/* ───────── page ───────── */
export default function BetaOffice() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const view = (/^\/beta\/office\/(word|excel|letterheads)/.exec(pathname) || [])[1] || 'docs';
  const id = new URLSearchParams(search).get('id') || '';
  const { selectedCompany } = useCompany() || {};
  const { user } = useAuth() || {};
  const companyId = selectedCompany?.companyId;
  const [docs, setDocs] = useState(null);
  const [lhs, setLhs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [clients, setClients] = useState([]);
  const [note, setNote] = useState(null);
  const [rd, setRd] = useState(0);
  const [rl, setRl] = useState(0);

  useEffect(() => { if (companyId) axios.get('/api/office/docs', { params: { companyId } }).then(r => setDocs(Array.isArray(r.data) ? r.data : [])).catch(() => setDocs([])); }, [companyId, rd, view]);
  useEffect(() => { if (companyId) axios.get('/api/office/letterheads', { params: { companyId } }).then(r => setLhs(Array.isArray(r.data) ? r.data : [])).catch(() => setLhs([])); }, [companyId, rl]);
  useEffect(() => {
    if (!companyId || view === 'docs' || view === 'letterheads') return;
    axios.get('/api/sales-orders', { params: { companyId } }).then(r => setOrders((Array.isArray(r.data) ? r.data : []).filter(o => !['cancelled', 'deleted'].includes(o.status)).sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate))))).catch(() => setOrders([]));
    axios.get('/api/clients', { params: { companyId } }).then(r => setClients((Array.isArray(r.data) ? r.data : []).filter(c => c.status !== 'deleted'))).catch(() => setClients([]));
  }, [companyId, view]);
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(null), 5000); return () => clearTimeout(t); }, [note]);

  const tabs = [['docs', 'Documents', '/beta/office'], ['word', id && view === 'word' ? 'Word — editing' : 'Word — New Letter', '/beta/office/word'], ['excel', id && view === 'excel' ? 'Excel — editing' : 'Excel — New Sheet', '/beta/office/excel'], ['letterheads', 'Letterheads', '/beta/office/letterheads']];
  const props = { companyId, user, letterheads: lhs, orders, clients, setNote, navigate };
  return (
    <div className="sb">
      <style>{SALES_CSS}{ACC_CSS}{OF_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {tabs.map(([k, l, p]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={`sb-tab${view === k ? ' on' : ''}`} onClick={() => navigate(p)}>{l}{k === 'docs' && docs && <span className="n">{docs.length}</span>}</button>)}
      </div>
      {note && <div className="sb-note">{note}<button type="button" onClick={() => setNote(null)} aria-label="Close">×</button></div>}
      {view === 'docs' && <Documents {...props} docs={docs} reload={() => setRd(x => x + 1)} />}
      {view === 'word' && <WordEditor key={`w${id}`} {...props} co={selectedCompany} docId={id} />}
      {view === 'excel' && <ExcelEditor key={`x${id}`} {...props} docId={id} />}
      {view === 'letterheads' && <Letterheads companyId={companyId} list={lhs} reload={() => setRl(x => x + 1)} setNote={setNote} />}
    </div>
  );
}
