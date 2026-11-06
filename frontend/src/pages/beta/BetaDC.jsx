/* Beta — Delivery Challan: Create DC | DC List | Dispatch Status. The tab is kept in the URL (?tab=…).
 *   Create DC       — send part / all of an order's products (and add-on items) on a DC with its e-way bill;
 *                     a DC is either "material first, bill later" or "against a bill made first"
 *   DC List         — every DC; select → Print / Edit / Delete
 *   Dispatch Status — per order product: ordered · sent (on DC / with bill) · billed · to send ·
 *                     sent but not billed · billed but not sent; counts of how material went */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useCompany } from '../../context/CompanyContext';
import { useAuth } from '../../context/AuthContext';
import { Svg } from '../../components/ui/Icon';
import { CSS as SALES_CSS, BIG, fyOf, FyFilter, fyCounts, useClearSel } from './BetaSales';
import { n, num, amt, fdate, dash, lineOwner, isIntra } from './BetaSalesBill';
import { dispatchOf, billMode } from './BetaDispatch';
import { printDC, billOfDc, printMerged } from './BetaDCPrint';
import { printSalesBill } from './BetaSalesPrint';
import { DOC_TYPES, SUB_TYPES, STATE_NAMES, CANCEL_REASONS, ewayDocOf, ewayJsonOf, downloadJson, ewayActive, cancelHoursLeft } from './BetaEwayJson';
import { SKIP_PO, poLines, poStatusOf, loadGrns, dropDcGrns, sameItem } from './BetaPurchaseLib';
import { PX_CSS } from './BetaPurchaseParts';

const TABS = [{ key: 'create', label: 'Create DC' }, { key: 'list', label: 'DC List' }, { key: 'status', label: 'Dispatch Status' }];
const SKIP = ['cancelled', 'draft', 'rejected'];
const r3 = v => Math.round((Number(v) || 0) * 1000) / 1000;
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sdate = d => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? String(d) : `${String(x.getDate()).padStart(2, '0')} ${MON3[x.getMonth()]} ${String(x.getFullYear()).slice(2)}`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const STATE = { none: ['N', '#D92D20', 'Nothing sent yet'], part: ['P', '#F79009', 'Part sent'], full: ['S', '#16A34A', 'All sent'] };
const TYPE = { 'before-bill': 'Material first', 'against-bill': 'Against bill', 'with-bill': 'With bill' };

/* E-Way Helper box (also opened from Fetch from GST) */
export const HB_CSS = `
.hb-back { position:fixed; inset:0; z-index:1600; background:rgba(2,24,28,.45); display:flex; align-items:flex-start; justify-content:center; padding:9vh 16px; }
.hb { width:100%; max-width:620px; background:#fff; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.35); font-size:12.5px; color:#344054; }
.hb-hd { display:flex; align-items:center; gap:10px; padding:10px 14px; background:linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%); color:#fff; } .hb-hd b { flex:1; font-size:14px; }
.hb-hd button { width:28px; height:28px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font-size:17px; }
.hb-bd { padding:14px; } .hb-bd h4 { margin:12px 0 6px; font-size:12.5px; color:#101828; } .hb-bd h4:first-child { margin-top:0; }
.hb-pc { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid #EDF2F3; } .hb-pc .s { width:9px; height:9px; border-radius:50%; } .hb-pc .m { flex:1; font-weight:600; color:#101828; }
.hb-state { display:flex; align-items:center; gap:8px; padding:9px 12px; background:#FEF3F2; color:#B42318; font-weight:600; border:1px solid #FECDCA; }
.hb-state .s { width:10px; height:10px; border-radius:50%; background:#D92D20; } .hb-state.on { background:#ECFDF3; color:#067647; border-color:#ABEFC6; } .hb-state.on .s { background:#16A34A; }
.hb-acts { display:flex; gap:8px; margin:10px 0 4px; }
.hb-big { flex:1; height:40px; display:inline-flex; align-items:center; justify-content:center; gap:7px; border:1px solid #03444f; background:#fff; color:#03444f; cursor:pointer; font:600 13px 'Inter', sans-serif; }
.hb-big.pri { background:#03444f; color:#fff; } .hb-big:disabled { opacity:.5; cursor:default; }
.hb-msg { margin-top:8px; padding:8px 10px; background:#F0F7F7; color:#03444f; } .hb-err { margin-top:8px; padding:8px 10px; background:#FDECEC; color:#B42318; }
.hb-link { margin-top:10px; border:0; background:none; color:#667085; text-decoration:underline; cursor:pointer; font-size:11.5px; padding:0; }
.hb-code { margin:8px 0; padding:10px; text-align:center; font:700 26px ui-monospace, Consolas, monospace; letter-spacing:6px; color:#03444f; background:#F0F7F7; border:1px dashed #9DBDC1; }
.hb-bd ol { margin:6px 0 0 18px; padding:0; line-height:1.7; } .hb-bd code { background:#F2F4F7; padding:1px 5px; border-radius:3px; }
.hb .sb-abtn { height:26px; padding:0 10px; border:1px solid #C9D7DA; border-radius:2px; background:#fff; color:#344054; cursor:pointer; font:600 12px 'Inter', sans-serif; }
`;
const DC_CSS = `
.dc-type { display:flex; gap:8px; flex-wrap:wrap; }
.dc-type label { display:flex; align-items:flex-start; gap:8px; padding:7px 10px; border:1px solid #C9D7DA; border-radius:4px; cursor:pointer; background:#fff; flex:1; min-width:240px; }
.dc-type label.on { border-color:#03444f; background:#F0F7F7; }
.sf .dc-type input { width:auto; height:auto; margin-top:2px; flex-shrink:0; accent-color:#03444f; box-shadow:none; }
.dc-type label > span { text-align:left; }
.dc-type b { display:block; font-size:12.5px; color:#101828; } .dc-type small { font-size:11px; color:#667085; }
.dc-tag { display:inline-block; padding:1px 7px; border-radius:99px; font-size:10.5px; font-weight:700; white-space:nowrap; }
.dc-tag.mf { background:#FFFAEB; color:#B54708; } .dc-tag.ab { background:#EEF4FF; color:#3538CD; }
.dc-kpi6 { grid-template-columns:repeat(6, 1fr) !important; }
.sb-t .warn { color:#B42318; font-weight:700; }
/* Dispatch Status: thin black lines between columns; headings wrap so they show in full */
.sb-t.ds th, .sb-t.ds th.r, .sb-t.ds th.c { white-space:normal; overflow:visible; text-overflow:clip; line-height:1.2; text-align:center; vertical-align:middle; border-right:1px solid #A9CDD2; }
.sb-t.ds td { border-right:1px solid #000; }
.sb-t.ds th:last-child { border-right:none; }
.sb-t.ds td.r { text-align:center; }
.ds-ad { display:inline-block; margin-right:6px; padding:0 5px; border:1px solid #B9D0D3; border-radius:2px; background:#F0F7F7; color:#03444f; font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; vertical-align:1px; }   /* numbers in the middle of their column */
.ew-cx { display:block; width:max-content; margin-top:3px; padding:1px 8px; border-radius:4px; border:1px solid #F5C2C0; background:#FEE4E2; color:#B42318; font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; }
.ew-cx.ew-exp { border-color:#FEDF89; background:#FFFAEB; color:#B54708; }
.ew-no-x { color:#B42318; text-decoration:line-through; text-decoration-thickness:1px; }
.ew-sel { margin:0 6px; height:26px; border:1px solid #FECDCA; border-radius:2px; font-size:12px; } .ew-rm { height:26px; width:200px; padding:0 7px; border:1px solid #FECDCA; border-radius:2px; font-size:12px; }
.pm-wrap { position:relative; display:flex; }
.pm-menu { position:absolute; right:0; top:41px; z-index:40; min-width:190px; display:flex; flex-direction:column; background:#fff; border:1px solid #B9D0D3; box-shadow:0 10px 28px rgba(16,24,40,.16); }
.pm-menu button { display:block; text-align:left; padding:8px 12px; border:0; border-bottom:1px solid #EDF2F3; background:#fff; cursor:pointer; font-family:inherit; }
.pm-menu button:hover:not(:disabled) { background:#F0F7F7; } .pm-menu button:disabled { opacity:.45; cursor:default; }
.pm-menu button.danger b { color:#B42318; } .pm-menu b { display:block; font-size:12.5px; color:#03444f; } .pm-menu small { font-size:11px; color:#667085; }
.sb-tbtn.gen { background:#03444f; color:#fff; } .sb-tbtn.gen:hover:not(:disabled) { background:#022f37; }
.ew-job { display:flex; align-items:center; gap:10px; padding:8px 14px; font-size:12.5px; border-bottom:1px solid #FEDF89; background:#FFFAEB; color:#93370D; flex-shrink:0; }
.ew-job .t { flex:1; } .ew-job .dot { width:10px; height:10px; border-radius:50%; background:#F79009; animation:ewp 1s infinite alternate; flex-shrink:0; }
.ew-job.done { background:#E6F4EA; color:#1E7B34; border-color:#B7E1C1; } .ew-job.done .dot { background:#16A34A; animation:none; }
.ew-job.failed { background:#FDECEC; color:#B42318; border-color:#F5C2C0; } .ew-job.failed .dot { background:#D92D20; animation:none; }
.ewp { padding:9px 14px 10px; background:#F5F9FA; border-bottom:1px solid #DCE6E8; flex-shrink:0; font-size:12.5px; color:#344054; }
.ewp-top { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
.ewp-top b { flex:1; font-weight:600; color:#101828; } .ewp-top .pc { color:#667085; font-weight:400; }
.ewp-top .t { font:600 11.5px ui-monospace, Consolas, monospace; color:#667085; white-space:nowrap; }
.ewp-bar { position:relative; height:16px; border:1px solid #9AA9AC; border-radius:3px; overflow:hidden;
  background:linear-gradient(#F3F3F3, #DADADA 50%, #CFCFCF 51%, #E8E8E8); box-shadow:inset 0 1px 2px rgba(0,0,0,.15); }
.ewp-fill { position:absolute; inset:0 auto 0 0; overflow:hidden; transition:width .35s ease-out;
  background:linear-gradient(#9BEA8C, #37C13A 45%, #06A70A 52%, #3BD13E); box-shadow:inset 0 0 0 1px rgba(255,255,255,.35); }
.ewp-fill::after { content:''; position:absolute; top:0; bottom:0; width:90px; left:-90px;
  background:linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.75), rgba(255,255,255,0)); animation:ewpshine 1.6s linear infinite; }
.ewp.wait .ewp-fill { background:linear-gradient(#FFE58A, #F5B800 45%, #E0A100 52%, #F7C531); }
@keyframes ewpshine { to { left:100%; } }
.ewp-steps { list-style:none; margin:8px 0 0; padding:0; display:flex; flex-wrap:wrap; gap:4px 16px; font-size:12px; }
.ewp-steps li { display:flex; align-items:center; gap:6px; color:#98A2B3; }
.ewp-steps li.done { color:#067647; } .ewp-steps li.now { color:#101828; font-weight:600; }
.ewp-steps .ic { width:13px; text-align:center; flex-shrink:0; }
.ewp-spin { display:inline-block; width:11px; height:11px; border:2px solid #C9D7DA; border-top-color:#03444f; border-radius:50%; animation:ewpspin .8s linear infinite; }
@keyframes ewpspin { to { transform:rotate(360deg); } }
.ewp-msg { margin-top:6px; font-size:12px; color:#667085; }
@media (prefers-reduced-motion: reduce) { .ewp-fill::after, .ewp-spin { animation:none; } .ewp-fill { transition:none; } }
.ew-x { border:0; background:none; font-size:16px; cursor:pointer; color:inherit; }
@keyframes ewp { from { opacity:.35; } to { opacity:1; } }
${HB_CSS}
.ec { max-width:460px; } .ec-pc { font-size:11.5px; opacity:.85; }
.ewm { max-width:560px; } .ewm .ewp { border-bottom:0; background:#fff; padding:14px 14px 4px; }
.ewm .ewp-steps { display:grid; gap:3px; }
.ewm .ec-in { padding:10px 14px 14px; border-top:1px solid #EDF2F3; margin-top:8px; }
.ec-lb { margin-bottom:10px; color:#475467; }
.ec-img { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.ec-img img { height:56px; max-width:260px; border:1px solid #C9D7DA; background:#fff; }
.ec-new { display:inline-flex; align-items:center; gap:5px; height:30px; padding:0 10px; border:1px solid #C9D7DA; background:#fff; color:#344054; cursor:pointer; font:600 12px 'Inter', sans-serif; }
.ec-row { display:flex; gap:8px; }
.ec-row input { flex:1; min-width:0; height:38px; padding:0 12px; border:1px solid #C9D7DA; outline:none; font:600 15px ui-monospace, Consolas, monospace; letter-spacing:.8px; }
.ec-row input:focus { border-color:#03444f; box-shadow:0 0 0 3px rgba(3,68,79,.12); }
.ec-go { height:38px; padding:0 20px; border:0; background:#F79009; color:#fff; cursor:pointer; font:700 13px 'Inter', sans-serif; }
.ec-go:hover:not(:disabled) { background:#DC6803; } .ec-go:disabled, .ec-new:disabled { opacity:.55; cursor:default; }
.ec-warn { margin-top:8px; padding:8px 10px; background:#FFFAEB; border:1px solid #FEDF89; color:#B54708; }
.ec-ft { display:flex; justify-content:flex-end; margin-top:12px; }
.ec-stop { height:30px; padding:0 14px; border:1px solid #C9D7DA; background:#fff; color:#344054; cursor:pointer; font:600 12px 'Inter', sans-serif; }
`;

export default function BetaDC() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const asked = new URLSearchParams(search).get('tab');
  const urlTab = TABS.some(t => t.key === asked) ? asked : 'create';
  const { selectedCompany } = useCompany() || {};
  const companyId = selectedCompany?.companyId;
  const { user } = useAuth() || {};

  const [orders, setOrders] = useState(null);
  const [bills, setBills] = useState(null);
  const [dcs, setDcs] = useState(null);
  const [lastNo, setLastNo] = useState(0);      // last DC no. ever given — the numbers missing below it were deleted
  const [pos, setPos] = useState([]);           // purchase orders — a product can go straight from the vendor to the client
  const [grns, setGrns] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState(null);
  const [createFor, setCreateFor] = useState(null);
  const [note, setNote] = useState(null);
  const [askPrint, setAskPrint] = useState(null);   // { dc, withValue, b } — DC to print and its tax invoice
  const [slot, setSlot] = useState(null);
  const [listQ, setListQ] = useState('');
  const [job, setJob] = useState(null);           // e-way job running through the E-Way Helper
  const [helperBox, setHelperBox] = useState(false);
  useEffect(() => {
    if (!job || ['done', 'failed'].includes(job.status)) return undefined;
    const t = setInterval(() => {
      axios.get(`/api/eway-helper/jobs/${job.id}`).then(async r => {
        const j = { ...r.data, after: job.after, dc: job.dc };
        if (['done', 'failed'].includes(j.status) && j.after === 'delete' && j.dc) {
          // the DC is deleted only when the portal says its e-way bill is cancelled
          if (j.outcome === 'cancelled') {
            try { await axios.delete(`/api/delivery-challans/${j.dc.dcId}`, { params: { companyId } }); await dropDcGrns(companyId, j.dc.dcId); j.message += ` DC ${j.dc.dcNo || j.dc.dcId} deleted.`; }
            catch { j.message += ' The DC could not be deleted — delete it again.'; }
          } else j.message += ` DC ${j.dc.dcNo || j.dc.dcId} was NOT deleted.`;
          j.after = '';
        }
        setJob(j);
        if (j.status === 'done') setReload(x => x + 1);
      }).catch(() => {});
    }, job.status === 'captcha' ? 1000 : 700);
    return () => clearInterval(t);
  }, [job]);

  useEffect(() => {
    if (!companyId) return;
    const p = { params: { companyId } };
    axios.get('/api/sales-orders', p).then(r => setOrders(Array.isArray(r.data) ? r.data : [])).catch(() => setOrders([]));
    axios.get('/api/bills', { params: { companyId, type: 'sales' } }).then(r => setBills(Array.isArray(r.data) ? r.data.filter(b => b && b.type !== 'purchase') : [])).catch(() => setBills([]));
    axios.get('/api/delivery-challans/meta/counter', p).then(r => setLastNo(Number(r.data?.last) || 0)).catch(() => setLastNo(0));
    axios.get('/api/delivery-challans', { params: { companyId, withDeleted: 1 } }).then(r => setDcs(Array.isArray(r.data) ? r.data : [])).catch(() => setDcs([]));   // deleted ones too — the list shows them
    axios.get('/api/purchase-orders', p).then(r => setPos(Array.isArray(r.data) ? r.data.filter(x => x && !SKIP_PO.includes(x.status)) : [])).catch(() => setPos([]));
    axios.get('/api/vendors', p).then(r => setVendors(Array.isArray(r.data) ? r.data : [])).catch(() => setVendors([]));
    loadGrns(companyId).then(setGrns);
  }, [companyId, reload]);

  const group = (arr, key) => { const m = {}; (arr || []).forEach(x => { if (x[key] != null && x[key] !== '') (m[String(x[key])] = m[String(x[key])] || []).push(x); }); return m; };
  const billsByOrder = useMemo(() => group(bills, 'orderId'), [bills]);
  const liveDcs = useMemo(() => (dcs || []).filter(d => d.status !== 'deleted'), [dcs]);
  /* DC numbers that are on no file — deleted before deleted DCs were kept: shown in the list as "deleted earlier" */
  const gaps = useMemo(() => {
    if (!dcs) return [];
    const have = new Map();   // number → prefix ("DC/2026-27/")
    dcs.forEach(d => { const m = String(d.dcNo || '').match(/^(.*\/)(\d+)$/); if (m) have.set(Number(m[2]), m[1]); });
    const max = Math.max(lastNo, ...have.keys(), 0);
    const nums = [...have.keys()].sort((a, b) => a - b);
    const fy = fyOf(new Date()), cur = `DC/${fy}-${String(Number(fy) + 1).slice(2)}/`;
    const out = [];
    for (let k = 1; k <= max; k += 1) {
      if (have.has(k)) continue;
      const near = nums.find(x => x > k) ?? nums[nums.length - 1];
      const prefix = near != null ? have.get(near) : cur;
      const y = (prefix.match(/(\d{4})-\d{2}/) || [])[1] || fy;
      out.push({ dcId: `gap${k}`, dcNo: `${prefix}${String(k).padStart(4, '0')}`, status: 'deleted', _gap: true, _fy: y, items: [], addons: [] });
    }
    return out;
  }, [dcs, lastNo]);   // a deleted DC sends nothing
  const dcsByOrder = useMemo(() => group(liveDcs, 'linkedSalesOrderId'), [liveDcs]);
  const soMap = useMemo(() => { const m = {}; (orders || []).forEach(o => { m[String(o.orderId)] = o; }); return m; }, [orders]);
  const rows = useMemo(() => (orders || []).filter(o => !SKIP.includes(o.status))
    .map(o => dispatchOf(o, dcsByOrder[String(o.orderId)] || [], billsByOrder[String(o.orderId)] || []))
    .sort((a, b) => String(b.o.orderDate || '').localeCompare(String(a.o.orderDate || ''))), [orders, dcsByOrder, billsByOrder]);
  const loading = orders === null || bills === null || dcs === null;
  const tab = editing ? 'create' : urlTab;
  const go = k => { setEditing(null); navigate(`/beta/delivery-challan?tab=${k}`); };
  const printOnly = (dc, withValue) => printDC({ dc, company: selectedCompany, user, withValue });   // with / without value is chosen at print time
  /* a DC tied to a tax invoice: ask whether to print the invoice too */
  const doPrint = (dc, withValue = true) => { const b = billOfDc(dc, bills); if (b) setAskPrint({ dc, withValue, b }); else printOnly(dc, withValue); };
  const runPrint = async withBill => {
    const { dc, withValue, b } = askPrint; setAskPrint(null);
    try {
      if (!withBill) { await printOnly(dc, withValue); return; }
      // DC + its tax invoice in one PDF
      setNote({ text: 'Preparing one PDF — delivery challan + tax invoice…' });
      const pages = [await printDC({ dc, company: selectedCompany, user, withValue, collect: true }),
        await printSalesBill({ b, order: soMap[String(b.orderId)], company: selectedCompany, user, collect: true })];
      await printMerged(pages);
      setNote(null);
    } catch { setNote({ err: true, text: 'Could not prepare the print (DC + invoice). Restart the backend if this is the first time.' }); }
  };
  const doGenerate = async list => {
    const one = Object.assign([...list], { __viaHelper: true });
    const json = doJson(one);
    if (!json) return false;
    setNote(null);
    try {
      const docs = list.map((dc, i) => ({ dcId: dc.dcId, dcNo: dc.dcNo, docNo: json.billLists[i].docNo }));
      const send = () => axios.post('/api/eway-helper/jobs', { companyId, json, docs });
      const r = await send().catch(async e => {
        if (e.response?.status !== 409 || !/not running/i.test(e.response?.data?.error || '')) throw e;
        setNote({ text: 'Starting the E-Way Helper on this PC…' }); startHelperOnThisPC();
        if (!(await waitHelperOnline(15000))) throw e;
        setNote(null); return send();
      });
      setJob(r.data);
      return true;
    } catch (e) {
      setNote({ text: e.response?.data?.error || 'Could not send to the E-Way Helper.', err: true });
      if (e.response?.status === 409 && /not running|pair/i.test(e.response?.data?.error || '')) setHelperBox(true);
      return false;
    }
  };
  /* cancel the e-way bill of a DC on the portal, or check that it is cancelled; after: 'delete' → delete the DC once confirmed */
  const doEwb = async (kind, dc, { reason = 2, remarks = '', after = '' } = {}) => {
    setNote(null);
    try {
      const send = () => axios.post('/api/eway-helper/jobs', { companyId, kind, dcId: dc.dcId, ewbNo: dc.ewayBillNo, reason, remarks, after });
      const r = await send().catch(async e => {
        if (e.response?.status !== 409 || !/not running/i.test(e.response?.data?.error || '')) throw e;
        setNote({ text: 'Starting the E-Way Helper on this PC…' }); startHelperOnThisPC();
        if (!(await waitHelperOnline(15000))) throw e;
        setNote(null); return send();
      });
      setJob({ ...r.data, after, dc });
      return true;
    } catch (e) {
      setNote({ text: e.response?.data?.error || 'Could not send to the E-Way Helper.', err: true });
      if (e.response?.status === 409 && /not running|pair/i.test(e.response?.data?.error || '')) setHelperBox(true);
      return false;
    }
  };
  const doJson = list => {
    const { json, bad } = ewayJsonOf(list, selectedCompany);
    if (bad.length) { setNote({ text: `E-way JSON not made — fill these first: ${bad.map(x => `${x.dc.dcNo || x.dc.dcId}: ${x.miss.join(', ')}`).join(' · ')}`, err: true }); return false; }
    const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    if (list.__viaHelper) return json;
    downloadJson(json, list.length === 1 ? `EWB_${String(list[0].dcNo || list[0].dcId).replace(/[^A-Za-z0-9-]/g, '_')}.json` : `EWB_${list.length}_DCs_${stamp}.json`);
    return true;
  };

  return (
    <div className="sb">
      <style>{SALES_CSS + DC_CSS + PX_CSS}</style>
      <div className="sb-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`sb-tab${tab === t.key ? ' on' : ''}`} onClick={() => go(t.key)}>
            {t.label}
            {t.key === 'list' && dcs && <span className="n">{liveDcs.length}</span>}
            {t.key === 'status' && !loading && <span className="n">{rows.filter(r => r.state !== 'full').length}</span>}
          </button>
        ))}
        <div className="sb-slot" ref={setSlot} />
      </div>
      {note && <div className="sb-note" role="status" style={note.err ? { background: '#FDECEC', color: '#B42318', borderColor: '#F5C2C0' } : undefined}>{note.text}
        {note.dc && <button type="button" className="sb-abtn" style={{ marginLeft: 8 }} onClick={() => doPrint(note.dc, true)}>Print (with value)</button>}
        {note.dc && <button type="button" className="sb-abtn" onClick={() => doPrint(note.dc, false)}>Print (without value)</button>}
        {note.dc && <button type="button" className="sb-abtn" onClick={() => doJson([note.dc])}>E-Way JSON</button>}
        {note.dc && !note.dc.ewayBillNo && <button type="button" className="sb-abtn" onClick={() => doGenerate([note.dc])}>Generate E-Way</button>}
        <button type="button" onClick={() => setNote(null)} aria-label="Dismiss" style={note.err ? { color: '#B42318' } : undefined}>×</button></div>}

      {askPrint && (
        <div className="sb-ask" role="alertdialog" aria-label="Print the tax invoice too?">
          <span>Print the tax invoice <b>{askPrint.b.billNo || askPrint.b.billId}</b> of DC <b>{askPrint.dc.dcNo || askPrint.dc.dcId}</b> too?</span>
          <button type="button" className="sb-abtn" onClick={() => setAskPrint(null)}>Cancel</button>
          <button type="button" className="sb-abtn" onClick={() => runPrint(false)}>DC only</button>
          <button type="button" className="sb-abtn danger" style={{ background: '#03444F', borderColor: '#03444F' }} onClick={() => runPrint(true)} autoFocus>DC + Invoice</button>
        </div>
      )}
      {job && !['done', 'failed'].includes(job.status) && (() => {
        const stop = () => axios.post(`/api/eway-helper/jobs/${job.id}/cancel`).finally(() => setJob(j => ({ ...j, status: 'failed', message: 'Cancelled.' })));
        return (
          <div className="hb-back" style={{ alignItems: 'center', padding: 16 }}>
            <div className="hb ewm" role="dialog" aria-modal="true" aria-labelledby="ewm-t">
              <div className="hb-hd"><b id="ewm-t">{job.kind === 'cancel' ? 'Cancel e-way bill' : job.kind === 'check' ? 'Check e-way bill' : 'Generate e-way bill'}</b><span className="ec-pc">{job.machine || ''}</span></div>
              <EwayProgress key={job.id} job={job} onCancel={stop} />
              {job.status === 'captcha' && job.captchaImg && <EwayCaptcha job={job} inline />}
            </div>
          </div>
        );
      })()}
      {job && ['done', 'failed'].includes(job.status) && (
        <div className={`ew-job ${job.status}`} role="status">
          <span className="dot" />
          <span className="t"><b>E-Way Helper{job.machine ? ` · ${job.machine}` : ''}:</b> {job.message}
            {job.status === 'done' && job.kind === 'generate' && job.results?.length > 0 && <> — {job.results.map(r => `${r.dcNo}: ${r.ewbNo}`).join(', ')}</>}</span>
          {!['done', 'failed'].includes(job.status)
            ? <button type="button" className="sb-abtn" onClick={() => axios.post(`/api/eway-helper/jobs/${job.id}/cancel`).finally(() => setJob(j => ({ ...j, status: 'failed', message: 'Cancelled.' })))}>Cancel</button>
            : <button type="button" className="ew-x" onClick={() => setJob(null)} aria-label="Dismiss">×</button>}
        </div>
      )}
      {helperBox && <HelperBox onClose={() => setHelperBox(false)} />}
      {tab === 'create' && (
        <div className="sb-body">
          {loading ? <div className="sb-empty">Loading orders, bills and challans…</div>
            : <DCForm key={editing ? `edit-${editing.dcId}` : createFor ? `for-${createFor.orderId}-${createFor.k}` : 'new'}
              companyId={companyId} company={selectedCompany} rows={rows} dcsByOrder={dcsByOrder} billsByOrder={billsByOrder} pos={pos} grns={grns} vendors={vendors}
              presetOrderId={createFor?.orderId} editDc={editing}
              onCancel={() => { setEditing(null); navigate('/beta/delivery-challan?tab=list'); }}
              onSaved={(dc, text) => { setReload(x => x + 1); setNote({ text, dc }); if (editing) { setEditing(null); navigate('/beta/delivery-challan?tab=list'); } }} />}
        </div>
      )}
      {tab === 'list' && <DCList dcs={dcs && [...dcs, ...gaps]} soMap={soMap} companyId={companyId} slot={slot} q={listQ} setQ={setListQ} onPrint={doPrint} onJson={doJson} onGenerate={doGenerate} onEwb={doEwb} onHelper={() => setHelperBox(true)} busyJob={!!job && !['done', 'failed'].includes(job.status)}
        onEdit={dc => { setNote(null); setEditing(dc); }}
        onDeleted={dc => { dropDcGrns(companyId, dc.dcId).finally(() => setReload(x => x + 1)); setNote({ text: `Deleted DC ${dc.dcNo || dc.dcId} — it stays at the end of the list (struck through) and its quantities are back to "to send".` }); }} setNote={t => setNote(t ? { text: t } : null)} />}
      {tab === 'status' && <DispatchStatus rows={rows} loading={loading} bills={bills || []} dcs={liveDcs} slot={slot}
        onDc={r => { setNote(null); setCreateFor({ orderId: r.o.orderId, k: Date.now() }); navigate('/beta/delivery-challan?tab=create'); }}
        onDcs={r => { setListQ(r.o.orderNo || String(r.o.orderId)); navigate('/beta/delivery-challan?tab=list'); }} />}
    </div>
  );
}

/* ── Create / edit a DC ── */
const blankHead = () => ({ dcDate: today(), dcType: 'before-bill', billId: '', ewayBillNo: '', ewayGenDate: '', ewayValidUpto: '', vehicleNo: '', transporterName: '', transporterId: '',
  transDocNo: '', transDocDate: '', approxDistanceKm: '', dispatchFrom: '', dispatchThrough: '', remarks: '',
  /* e-way JSON */ ewayDocType: '', ewaySubSupplyType: '1', ewayDocNo: '', dispatchPlace: '', dispatchPincode: '', dispatchState: '', shippingCity: '', shippingPincode: '', shippingState: '' });

function DCForm({ companyId, company, rows, dcsByOrder, billsByOrder, pos = [], grns = [], vendors = [], presetOrderId, editDc, onSaved, onCancel }) {
  const { user: me } = useAuth() || {};
  const [orderId, setOrderId] = useState(editDc ? String(editDc.linkedSalesOrderId || '') : presetOrderId ? String(presetOrderId) : '');
  const [order, setOrder] = useState(null);
  const [head, setHead] = useState(() => {
    const h = blankHead();
    if (editDc) Object.keys(h).forEach(k => { if (editDc[k] != null && editDc[k] !== '') h[k] = String(editDc[k]); });
    if (editDc && editDc.linkedBillId) h.billId = String(editDc.linkedBillId);
    return h;
  });
  const [qty, setQty] = useState({});
  const [aq, setAq] = useState({});
  const [pq, setPq] = useState({});     // '<idx>|<source>' → qty, when one product comes from more than one vendor / PO
  const [src, setSrc] = useState({});   // 'p<idx>' / 'a<i>' → PO id when that product goes straight from the vendor to the client
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!orderId) { setOrder(null); return; }
    let live = true;
    const fallback = rows.find(r => String(r.o.orderId) === orderId)?.o || null;
    axios.get(`/api/sales-orders/${orderId}`, { params: { companyId } })
      .then(r => { if (live) setOrder(r.data && r.data.orderId != null ? r.data : fallback); })
      .catch(() => { if (live) setOrder(fallback); });
    return () => { live = false; };
  }, [orderId, companyId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // e-way places: ship-to from the order, dispatch-from from the company — only fills what is still empty
  useEffect(() => {
    if (!order) return;
    setHead(h => ({
      ...h,
      shippingCity: h.shippingCity || order.shipToCity || order.customerCity || '',
      shippingPincode: h.shippingPincode || String(order.shipToPincode || order.customerPincode || ''),
      shippingState: h.shippingState || order.shipToState || order.customerState || '',
      dispatchPlace: h.dispatchPlace || company?.city || '',
      dispatchPincode: h.dispatchPincode || String(company?.pincode || ''),
      dispatchState: h.dispatchState || company?.state || '',
    }));
  }, [order, company]);

  const dp = useMemo(() => (order ? dispatchOf(order, dcsByOrder[String(order.orderId)] || [], billsByOrder[String(order.orderId)] || [], editDc?.dcId) : null), [order, dcsByOrder, billsByOrder, editDc]);
  const orderBills = useMemo(() => (order ? (billsByOrder[String(order.orderId)] || []) : []), [order, billsByOrder]);
  /* only bills that have no DC yet — once a DC is made against a bill (or tied to it), that bill is not offered again.
     When editing, the DC's own bill stays in the list. */
  const billFirst = useMemo(() => {
    const used = new Set();
    (order ? dcsByOrder[String(order.orderId)] || [] : []).forEach(d => {
      if (!d || d.status === 'deleted' || (editDc && String(d.dcId) === String(editDc.dcId))) return;
      [d.linkedBillId, d.linkedInvoiceId].filter(Boolean).forEach(id => used.add(String(id)));
    });
    return orderBills.filter(b => !used.has(String(b.billId)))
      .sort((a, b) => (billMode(a) === 'before-dc' ? 0 : 1) - (billMode(b) === 'before-dc' ? 0 : 1));
  }, [order, dcsByOrder, orderBills, editDc]);

  // edit: start from the DC's own quantities
  const initFor = useRef(null);
  useEffect(() => {
    if (!dp || initFor.current === String(dp.o.orderId)) return;
    initFor.current = String(dp.o.orderId);
    if (!editDc) { setQty({}); setAq({}); setSrc({}); return; }
    const items = dp.lines.map(l => ({ it: l.it, idx: l.idx })), q = {}, a = {}, f = {}, pp = {};
    (editDc.items || []).forEach(li => { const x = lineOwner(li, items); if (x) {
      const pk = `${x.idx}|${li.fromGrnId ? `grn:${li.fromGrnId}` : li.fromPoId ? `po:${li.fromPoId}` : ''}`; pp[pk] = String(r3(n(pp[pk]) + n(li.qty))); q[x.idx] = String(r3(n(q[x.idx]) + n(li.qty))); if (li.fromGrnId) f[`p${x.idx}`] = `grn:${li.fromGrnId}`; else if (li.fromPoId) f[`p${x.idx}`] = `po:${li.fromPoId}`; } });
    (editDc.addons || []).forEach(da => { const x = dp.addons.find(y => (da.addonIdx != null ? y.i === Number(da.addonIdx) : y.a.description === da.description)); if (x) { a[x.i] = String(n(da.qty)); if (da.fromGrnId) f[`a${x.i}`] = `grn:${da.fromGrnId}`; else if (da.fromPoId) f[`a${x.i}`] = `po:${da.fromPoId}`; } });
    setQty(q); setAq(a); setSrc(f); setPq(pp);
  }, [dp, editDc]);

  const set = k => e => { const v = e.target.value; setHead(h => ({ ...h, [k]: v })); };
  const bill = orderBills.find(b => b.billId === head.billId) || null;
  const cap = l => l.toSend;   // never more than is left to send
  const errs = {};
  (dp?.lines || []).forEach(l => { const q = n(qty[l.idx]); if (q > cap(l) + 1e-9) errs[l.idx] = `Only ${num(cap(l))} left to send`; });
  (dp?.addons || []).forEach(x => { if (n(aq[x.i]) > x.toSend + 1e-9) errs[`a${x.i}`] = `Only ${num(x.toSend)} left`; });
  const sendItems = (dp?.lines || []).filter(l => n(qty[l.idx]) > 0);
  const sendAddons = (dp?.addons || []).filter(x => n(aq[x.i]) > 0);

  /* where a product can be dispatched from, besides our factory / store:
   *   po:<id>  — straight from the vendor of a PO of this order (a GRN "direct to client" is made with the DC)
   *   grn:<id> — from another vendor's yard, where a GRN already put it ("to another vendor"); no new GRN */
  const myPos = useMemo(() => (order ? pos.filter(p => String(p.linkedSalesOrderId) === String(order.orderId)) : []), [pos, order]);
  const poSt = useMemo(() => {
    const others = grns.filter(g => !(editDc && g.source === 'dc' && String(g.dcId) === String(editDc.dcId)));
    const m = {}; myPos.forEach(p => { m[String(p.orderId)] = poStatusOf(p, [], others); }); return m;
  }, [myPos, grns, editDc]);
  const yards = useMemo(() => {
    if (!order) return [];
    const myPoIds = new Set(myPos.map(p => String(p.orderId)));
    const otherDcs = (dcsByOrder[String(order.orderId)] || []).filter(d => !editDc || String(d.dcId) !== String(editDc.dcId));
    const out = [];
    grns.filter(g => g._src === 'grn' && g.deliveryType === 'to-vendor' && (String(g.soId) === String(order.orderId) || myPoIds.has(String(g.poId))))
      .forEach(g => (g.items || []).forEach(li => {
        const q = n(li.receivedQty ?? li.qty); if (!q) return;
        const used = otherDcs.reduce((t, d) => t + [...(d.items || []), ...(d.addons || [])].filter(x => String(x.fromGrnId) === String(g.grnId) && sameItem({ itemName: li.itemName }, x)).reduce((a, x) => a + n(x.qty), 0), 0);
        out.push({ g, li, left: Math.max(0, r3(q - used)) });
      }));
    return out;
  }, [grns, order, myPos, dcsByOrder, editDc]);
  const optsFor = it => [
    ...yards.filter(y => sameItem({ itemName: y.li.itemName, itemCode: y.li.itemCode }, it)).map(y => ({ v: `grn:${y.g.grnId}`, left: y.left, y,
      label: `At yard of ${y.g.toVendorName} · ${y.g.grnNo} (from ${y.g.vendorName}, ${num(y.left)} there)` })),
    ...myPos.map(p => { const pl = (poSt[String(p.orderId)] || []).find(x => sameItem({ itemName: x.name, itemCode: x.code }, it));
      return pl ? { v: `po:${p.orderId}`, left: pl.toReceive, po: p, pl, label: `Direct from vendor: ${p.vendorName} · ${p.poNo} (left on PO ${num(pl.toReceive)})` } : null; }).filter(Boolean),
  ];
  const low = x => String(x || '').trim().toLowerCase();
  const vendorOf = (id, name) => vendors.find(x => id && String(x.vendorId) === String(id)) || vendors.find(x => low(x.vendorName) && low(x.vendorName) === low(name)) || {};
  /* the place a source dispatches from: a PO's ship-from, else the vendor's dispatch / bill-from address */
  const placeOf = v => {
    if (!v) return null;
    const [kind, id] = v.split(':');
    if (kind === 'grn') {
      const y = yards.find(x => String(x.g.grnId) === id); if (!y) return null;
      const vd = vendorOf(y.g.toVendorId, y.g.toVendorName);
      const d = vd.dispatchSame === false && vd.dispatchFrom && (vd.dispatchFrom.address || vd.dispatchFrom.city) ? vd.dispatchFrom : vd;
      return { name: y.g.toVendorName, address: d.address, city: d.city, state: d.state, pincode: d.pincode };
    }
    const p = myPos.find(x => String(x.orderId) === id); if (!p) return null;
    const vd = vendorOf(p.vendorId, p.vendorName);
    const d = p.shipFromAddress || p.shipFromCity ? { address: p.shipFromAddress, city: p.shipFromCity, state: p.shipFromState, pincode: p.shipFromPincode }
      : vd.dispatchSame === false && vd.dispatchFrom && (vd.dispatchFrom.address || vd.dispatchFrom.city) ? vd.dispatchFrom
        : { address: vd.address || p.vendorAddress, city: vd.city || p.vendorCity, state: vd.state || p.vendorState, pincode: vd.pincode || p.vendorPincode };
    return { name: p.vendorName, ...d };
  };
  /* new DC: a product whose material is lying at a vendor's yard, or still with the vendor of its PO, goes from there by default */
  const defFor = useRef(null);
  useEffect(() => {
    if (editDc || !dp || defFor.current === String(dp.o.orderId)) return;
    if (!grns.length && !pos.length) return;
    defFor.current = String(dp.o.orderId);
    const f = {};
    const pick = (k, it) => { const o = optsFor(it); const best = o.find(x => x.y && x.left > 0) || o.find(x => x.po && x.left > 0); if (best) f[k] = best.v; };
    dp.lines.forEach(l => pick(`p${l.idx}`, l.it));
    dp.addons.forEach(x => pick(`a${x.i}`, { description: x.a.description }));
    setSrc(f);
  }, [dp, editDc, grns, pos]);   // eslint-disable-line react-hooks/exhaustive-deps
  /* dispatch-from follows the first vendor source — unless it was typed in by hand */
  const autoFrom = useRef(editDc ? null : '');
  useEffect(() => {
    if (!order) return;
    const first = Object.values(src).find(Boolean);
    const pl = placeOf(first);
    setHead(h => {
      if (autoFrom.current === null || (h.dispatchFrom.trim() && h.dispatchFrom !== autoFrom.current)) return h;   // typed by hand / editing: leave it
      const text = pl && (pl.address || pl.city) ? [String(pl.address || '').replace(/\s*[\r\n]+\s*/g, ', '), pl.city, pl.state, pl.pincode].filter(Boolean).join(', ').replace(/,(\s*,)+/g, ',') : '';
      autoFrom.current = text;
      return text
        ? { ...h, dispatchFrom: text, dispatchPlace: pl.city || h.dispatchPlace, dispatchPincode: String(pl.pincode || h.dispatchPincode || ''), dispatchState: pl.state || h.dispatchState }
        : { ...h, dispatchFrom: '', dispatchPlace: company?.city || '', dispatchPincode: String(company?.pincode || ''), dispatchState: company?.state || '' };
    });
  }, [src, order]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pickSrc = (k, v) => setSrc(x => ({ ...x, [k]: v }));
  const fromV = v => {
    const [kind, id] = String(v || '').split(':');
    if (kind === 'grn') { const y = yards.find(x => String(x.g.grnId) === id); return y ? { fromGrnId: String(y.g.grnId), fromGrnNo: y.g.grnNo || '', fromVendorId: y.g.toVendorId || '', fromVendorName: y.g.toVendorName || '', fromPoId: String(y.g.poId || ''), fromPoNo: y.g.poNo || '', fromPoVendorName: y.g.vendorName || '' } : {}; }
    const p = kind === 'po' && myPos.find(x => String(x.orderId) === id);
    return p ? { fromPoId: String(p.orderId), fromPoNo: p.poNo || '', fromVendorId: p.vendorId || '', fromVendorName: p.vendorName || '' } : {};
  };
  const fromOf = k => fromV(src[k]);
  /* a product ordered from 2+ vendors / POs: one line per vendor (and our store), each with its own qty; the product's qty is their sum */
  const isMulti = l => optsFor(l.it).filter(o => o.po).length >= 2;
  const partsOf = l => (isMulti(l)
    ? [{ v: '', q: n(pq[`${l.idx}|`]) }, ...optsFor(l.it).map(o => ({ v: o.v, o, q: n(pq[`${l.idx}|${o.v}`]) }))]
    : [{ v: src[`p${l.idx}`] || '', q: n(qty[l.idx]) }]);
  const setPart = (l, v, val) => {
    const nx = { ...pq, [`${l.idx}|${v}`]: val };
    const sum = r3(Object.entries(nx).filter(([k]) => k.startsWith(`${l.idx}|`)).reduce((t, [, x]) => t + n(x), 0));
    setPq(nx); setQty(x => ({ ...x, [l.idx]: sum ? String(sum) : '' }));
  };
  const splitSel = l => (
    <div className="px-split">
      {[{ v: '', label: 'Our factory / store' }, ...optsFor(l.it).map(o => ({ v: o.v, o, label: o.y ? `Yard of ${o.y.g.toVendorName} · ${o.y.g.grnNo}` : `${o.po.vendorName} · ${o.po.poNo}` }))].map(r => {
        const val = pq[`${l.idx}|${r.v}`] ?? '', over = r.o && n(val) > r.o.left + 1e-9;
        return (
          <div key={r.v || 'store'} className={`px-sr${n(val) > 0 ? ' on' : ''}`}>
            <span className="nm">{r.label}{r.o && <small> · {r.o.y ? `${num(r.o.left)} there` : `left on PO ${num(r.o.left)}`}</small>}</span>
            <input className={`sf-q${over ? ' bad' : ''}`} inputMode="decimal" value={val} placeholder="0"
              onChange={e => setPart(l, r.v, e.target.value.replace(/[^\d.]/g, ''))} aria-label={`Send qty of ${l.name} from ${r.label}`} />
            {over && <span className="sf-err" style={{ color: '#B54708' }}>Only {num(r.o.left)}</span>}
          </div>
        );
      })}
      <span className="px-hint" style={{ display: 'block' }}>This product is on more than one PO — enter how many go from each vendor. A GRN is made for each PO used.</span>
    </div>
  );
  const fromSel = (k, it, q) => {
    const opts = optsFor(it);
    if (!opts.length) return null;
    const cur = opts.find(o => o.v === src[k]);
    return (
      <div style={{ marginTop: 4 }}>
        <select className={`px-from${cur ? ' vd' : ''}`} value={src[k] || ''} onChange={e => pickSrc(k, e.target.value)} aria-label="Dispatch from">
          <option value="">Dispatch from: our factory / store</option>
          {opts.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
        {cur && q > cur.left + 1e-9 && <span className="sf-err" style={{ color: '#B54708' }}>Only {num(cur.left)} {cur.y ? `at the yard of ${cur.y.g.toVendorName}` : `left to receive on ${cur.po.poNo}`}</span>}
        {cur && <span className="px-hint" style={{ display: 'block' }}>{cur.y ? `Goes from the yard of ${cur.y.g.toVendorName} — already received there on ${cur.y.g.grnNo}` : `Goes straight from ${cur.po.vendorName} — the GRN of ${cur.po.poNo} is made with this DC`}</span>}
      </div>
    );
  };
  /* GRNs for what went straight from a PO's vendor: one per PO, made again whenever the DC is saved (yard material already has its GRN) */
  const syncGrns = async dc => {
    if (!dc?.dcId) return 0;
    await dropDcGrns(companyId, dc.dcId, { hard: true });   // made afresh below
    const groups = {};
    const add = (v, it, q) => { v = String(v || ''); if (v.startsWith('po:') && q > 0) { const id = v.slice(3); (groups[id] = groups[id] || []).push({ it, q }); } };
    sendItems.forEach(l => partsOf(l).forEach(p => add(p.v, l.it, p.q)));
    sendAddons.forEach(x => add(src[`a${x.i}`], { description: x.a.description }, n(aq[x.i])));
    let made = 0;
    for (const [pid, list] of Object.entries(groups)) {
      const p = myPos.find(x => String(x.orderId) === pid); if (!p) continue;
      const pls = poLines(p);
      const items = list.map(e => { const pl = pls.find(x => sameItem({ itemName: x.name, itemCode: x.code }, e.it)); return pl ? { itemIdx: pl.idx, itemCode: pl.code, itemName: pl.name, hsnCode: pl.hsn, unit: pl.unit, orderedQty: pl.qty, rate: pl.rate, receivedQty: e.q, remarks: '' } : null; }).filter(Boolean);
      if (!items.length) continue;
      await axios.post('/api/grn', {
        companyId, poId: pid, poNo: p.poNo || '', vendorId: p.vendorId || '', vendorName: p.vendorName || '',
        receiptDate: dc.dcDate || head.dcDate, vehicleNo: dc.vehicleNo || '', soId: order.orderId, orderNo: order.orderNo || '',
        clientId: order.clientId || order.customerCode || '', clientName: order.customerName || order.party || '',
        deliveryType: 'direct-client', deliveryLocation: [order.shipToName, order.shipToCity || order.customerCity].filter(Boolean).join(', '),
        source: 'dc', dcId: dc.dcId, dcNo: dc.dcNo || '', remarks: `Sent by the vendor straight to the client on DC ${dc.dcNo || dc.dcId}`, items,
        createdBy: { id: me?.id, name: me?.name || me?.username || '', username: me?.username || '' },
      });
      made += 1;
    }
    return made;
  };
  const value = sendItems.reduce((s, l) => s + n(qty[l.idx]) * l.rate, 0);
  const intra = order ? isIntra(company, order) : false;
  const gstAmt = sendItems.reduce((s, l) => s + n(qty[l.idx]) * l.rate * l.gstPct / 100, 0);
  const r2 = v => Math.round(v * 100) / 100;

  const fillAll = () => {
    const q = {}, pp = {};
    (dp?.lines || []).forEach(l => {
      q[l.idx] = cap(l) > 0 ? String(cap(l)) : '';
      if (!isMulti(l)) return;
      let need = cap(l);   // vendors first (by what is left on each PO), the rest from our store
      optsFor(l.it).forEach(o => { const t = Math.min(need, Math.max(0, o.left)); if (t > 0) { pp[`${l.idx}|${o.v}`] = String(r3(t)); need = r3(need - t); } });
      if (need > 0) pp[`${l.idx}|`] = String(need);
    });
    setQty(q); setPq(pp);
    const a = {}; (dp?.addons || []).forEach(x => { a[x.i] = x.toSend > 0 ? String(x.toSend) : ''; }); setAq(a);
  };
  const reset = () => { initFor.current = null; defFor.current = null; autoFrom.current = ''; setOrderId(''); setOrder(null); setQty({}); setAq({}); setSrc({}); setPq({}); setHead(blankHead()); setTried(false); };

  const save = async () => {
    setTried(true); setMsg(null);
    if (!order) return setMsg({ k: 'err', t: 'Pick the sales order first.' });
    if (!head.dcDate) return setMsg({ k: 'err', t: 'Enter the DC date.' });
    if (head.dcType === 'against-bill' && !bill) return setMsg({ k: 'err', t: 'Choose the bill this material is sent against.' });
    if (Object.keys(errs).length) return setMsg({ k: 'err', t: 'Some quantities are more than what is left to send — see the red boxes.' });
    if (!sendItems.length && !sendAddons.length) return setMsg({ k: 'err', t: 'Enter the quantity to send for at least one product or add-on item.' });
    setBusy(true);
    try {
      const o = order;
      const payload = {
        companyId, ...Object.fromEntries(Object.entries(head).map(([k, v]) => [k, String(v).trim()])),
        ...(editDc ? {} : { createdBy: { id: me?.id, name: me?.name || me?.username || '', username: me?.username || '' } }),   // who made the DC (kept on edit)
        linkedSalesOrderId: o.orderId, orderNo: o.orderNo || '', orderDate: o.orderDate || '', clientOrderNo: o.customerPO || '', clientPoDate: o.poDate || '',
        customerName: o.customerName || o.party || '', customerGstin: o.customerGstin || o.partyGstin || '',
        billingName: o.contactPerson || '', billingMobile: o.mobile || '', billingEmail: o.email || '',
        billingAddress: o.address || '', billingCity: o.customerCity || '', billingState: o.customerState || '', billingPincode: o.customerPincode || '',
        shippingName: o.shipToName || o.customerName || '', shippingMobile: o.shipToMobile || o.mobile || '',
        shippingAddress: o.shipToAddress || o.deliveryAddr || o.address || '', shippingCity: head.shippingCity.trim() || o.shipToCity || o.customerCity || '',
        shippingState: head.shippingState.trim() || o.shipToState || o.customerState || '', shippingPincode: head.shippingPincode.trim() || o.shipToPincode || o.customerPincode || '',
        linkedBillId: head.dcType === 'against-bill' && bill ? bill.billId : '',
        invoiceNo: head.dcType === 'against-bill' && bill ? (bill.billNo || bill.billId) : '',
        invoiceDate: head.dcType === 'against-bill' && bill ? (bill.billDate || '') : '',
        items: sendItems.flatMap(l => partsOf(l).filter(p => p.q > 0).map(p => ({ itemIdx: l.idx, itemCode: l.code, description: l.name, hsnCode: l.hsn, unit: l.unit, qty: p.q, rate: l.rate, gst: l.gstPct, ...fromV(p.v) }))),
        addons: sendAddons.map(x => ({ addonIdx: x.i, description: x.a.description, category: x.a.category || '', remarks: x.a.remarks || '', unit: x.a.unit || 'NOS', qty: n(aq[x.i]), ...fromOf(`a${x.i}`) })),
        totalValue: r2(value), totalGst: r2(gstAmt), grandTotal: r2(value + gstAmt), gstSplit: intra ? 'intra' : 'inter',
        cgst: intra ? r2(gstAmt / 2) : 0, sgst: intra ? r2(gstAmt / 2) : 0, igst: intra ? 0 : r2(gstAmt),
      };
      delete payload.billId;
      const r = editDc
        ? await axios.put(`/api/delivery-challans/${editDc.dcId}`, payload)
        : await axios.post('/api/delivery-challans', payload);
      const dc = r.data || payload;
      let grnText = '';
      if (editDc || Object.values(src).some(v => String(v).startsWith('po:')) || Object.entries(pq).some(([k, v]) => k.includes('|po:') && n(v) > 0)) {
        try { const made = await syncGrns(dc); if (made) grnText = ` ${made} GRN${made === 1 ? '' : 's'} made for the material sent straight from the vendor.`; }
        catch { grnText = ' The GRN for the vendor material could not be made — save the DC again.'; }
      }
      const text = `${editDc ? 'Updated' : 'Saved'} DC ${dc.dcNo || dc.dcId || ''} for order ${o.orderNo || o.orderId} — ${sendItems.length} product${sendItems.length === 1 ? '' : 's'}${sendAddons.length ? ` + ${sendAddons.length} add-on${sendAddons.length === 1 ? '' : 's'}` : ''}.${grnText}`;
      if (!editDc) reset();
      onSaved?.(dc, text);
    } catch (e) { setMsg({ k: 'err', t: e.response?.data?.error || 'Could not save the DC.' }); }
    finally { setBusy(false); }
  };

  const F1 = (k, label, ph) => <label><span>{label}</span><input value={head[k]} onChange={set(k)} placeholder={ph || ''} /></label>;

  return (
    <div className="sf">
      <div className="sf-hero">
        <span className="ic"><Svg name="swap" size={15} /></span>
        <h1>{editDc ? `Edit Delivery Challan ${editDc.dcNo || editDc.dcId}` : 'Create Delivery Challan'}</h1>
        <span className="grow" />
        {order && <span className="sf-chip"><small>Order</small><b>{order.orderNo || order.orderId}</b></span>}
        <span className="sf-chip"><small>Value + GST</small><b>₹ {amt(value + gstAmt)}</b></span>
      </div>

      <div className="sf-2" style={{ marginTop: 10 }}>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="cart" size={13} /></span><b>Sales Order</b><span className="grow" />{dp && <small>{dp.dcs.length} DC{dp.dcs.length === 1 ? '' : 's'} so far</small>}</div>
          <table className="sf-kv"><tbody>
            <tr><th>Order No. <i>*</i></th><td>
              <div className="sf-srch">
                <input readOnly value={order ? `${order.orderNo || order.orderId} · ${order.customerName || order.party || ''}` : orderId ? 'Loading…' : ''} placeholder="Click to pick the sales order"
                  onClick={() => !editDc && setPicker(true)} className={tried && !orderId ? 'bad' : ''} disabled={!!editDc} />
                <button type="button" className="sf-sbtn" onClick={() => setPicker(true)} disabled={!!editDc} aria-label="Pick sales order"><Svg name="search" size={14} /></button>
              </div>
            </td></tr>
            <tr><th>Client PO</th><td>{order ? <>{dash(order.customerPO)}{order.poDate ? <span style={{ color: '#667085' }}> · {fdate(order.poDate)}</span> : ''}</> : '—'}</td></tr>
            <tr><th>Ship to</th><td>{order ? dash([order.shipToName, order.shipToCity || order.customerCity].filter(Boolean).join(', ')) : '—'}</td></tr>
            <tr><th>Sent so far</th><td>{dp ? `${num(dp.sentQty)} of ${num(dp.orderQty)} · billed ${num(dp.billedQty)}` : '—'}</td></tr>
          </tbody></table>
        </div>
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="file" size={13} /></span><b>DC Details</b></div>
          <table className="sf-kv"><tbody>
            <tr><th>DC Date <i>*</i></th><td><input type="date" value={head.dcDate} onChange={set('dcDate')} className={tried && !head.dcDate ? 'bad' : ''} /></td></tr>
            <tr><th>This DC is</th><td>
              <div className="dc-type" role="radiogroup" aria-label="DC type">
                <label className={head.dcType === 'before-bill' ? 'on' : ''}><input type="radio" checked={head.dcType === 'before-bill'} onChange={() => setHead(h => ({ ...h, dcType: 'before-bill', billId: '' }))} />
                  <span><b>Material first</b><small>Bill (e-invoice) will be made later</small></span></label>
                <label className={head.dcType === 'against-bill' ? 'on' : ''}><input type="radio" checked={head.dcType === 'against-bill'} onChange={() => setHead(h => ({ ...h, dcType: 'against-bill', billId: h.billId || (billFirst[0]?.billId || '') }))} />
                  <span><b>Against a bill</b><small>Bill already made — material goes now</small></span></label>
              </div>
            </td></tr>
            {head.dcType === 'against-bill' && <tr><th>Bill <i>*</i></th><td>
              <select value={head.billId} onChange={set('billId')} className={tried && !bill ? 'bad' : ''}>
                <option value="">{billFirst.length ? 'Choose the bill…' : orderBills.length ? 'Every bill of this order already has a DC' : 'No bill on this order yet'}</option>
                {billFirst.map(b => <option key={b.billId} value={b.billId}>{b.billNo || b.billId} · {fdate(b.billDate)} · ₹ {amt(b.grandTotal)}{billMode(b) === 'before-dc' ? ' · material not sent' : ''}</option>)}
              </select>
              <span className="sf-hint" style={{ fontSize: 11, color: '#667085' }}>Only bills without a DC are listed.</span>
            </td></tr>}
            <tr><th>Remarks</th><td><input value={head.remarks} onChange={set('remarks')} placeholder="Optional" /></td></tr>
          </tbody></table>
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="swap" size={13} /></span><b>E-Way Bill &amp; Transport</b><small>E-way bill only if made — vehicle no. / transporter print on the DC even without it</small></div>
        <div className="sf-eg">
          {F1('ewayBillNo', 'E-Way Bill No.')}{F1('ewayGenDate', 'Generated Date', 'e.g. 26-Oct-26 11:42 AM')}{F1('ewayValidUpto', 'Valid Upto', 'e.g. 29-Oct-26 11:59 PM')}{F1('vehicleNo', 'Vehicle No.')}
          {F1('transporterName', 'Transporter Name')}{F1('transporterId', 'Transporter ID')}{F1('transDocNo', 'Transport Doc No.')}{F1('transDocDate', 'Transport Doc Date')}
          {F1('approxDistanceKm', 'Approx. Distance (KM)')}{F1('dispatchThrough', 'Dispatched Through', 'e.g. By Road')}<label className="w2"><span>Dispatch From (address)</span><input value={head.dispatchFrom} onChange={set('dispatchFrom')} placeholder="Leave blank = company address" /></label>
        </div>
        <div className="sf-es">For the e-way bill JSON</div>
        <div className="sf-eg">
          <label><span>Document Type</span><select value={head.ewayDocType} onChange={set('ewayDocType')}>
            <option value="">Auto — {DOC_TYPES.find(([k]) => k === ewayDocOf({ dcType: head.dcType, invoiceNo: bill ? (bill.billNo || bill.billId) : '' }).docType)?.[1]}</option>
            {DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l} ({k})</option>)}</select></label>
          <label><span>Sub Type</span><select value={head.ewaySubSupplyType} onChange={set('ewaySubSupplyType')}>{SUB_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label><span>Document No.</span><input value={head.ewayDocNo} onChange={set('ewayDocNo')} placeholder={head.dcType === 'against-bill' && bill ? `Auto: ${bill.billNo || bill.billId}` : editDc ? `Auto: ${editDc.dcNo || ''}` : 'Auto: the DC no.'} /></label>
          <span />
          {F1('dispatchPlace', 'Dispatch Place')}{F1('dispatchPincode', 'Dispatch Pincode')}
          <label><span>Dispatch State</span><select value={head.dispatchState} onChange={set('dispatchState')}><option value="">—</option>{STATE_NAMES.map(([c, nm]) => <option key={c} value={nm}>{nm} ({c})</option>)}{head.dispatchState && !STATE_NAMES.some(([, nm]) => nm.toLowerCase() === head.dispatchState.toLowerCase()) && <option value={head.dispatchState}>{head.dispatchState}</option>}</select></label>
          <span />
          {F1('shippingCity', 'Ship-to Place')}{F1('shippingPincode', 'Ship-to Pincode')}
          <label><span>Ship-to State</span><select value={head.shippingState} onChange={set('shippingState')}><option value="">—</option>{STATE_NAMES.map(([c, nm]) => <option key={c} value={nm}>{nm} ({c})</option>)}{head.shippingState && !STATE_NAMES.some(([, nm]) => nm.toLowerCase() === head.shippingState.toLowerCase()) && <option value={head.shippingState}>{head.shippingState}</option>}</select></label>
        </div>
      </div>

      <div className="sf-card">
        <div className="sf-ch"><span className="ico"><Svg name="box" size={13} /></span><b>Products to send</b><span className="grow" />{dp && <button type="button" className="sf-lnk" onClick={fillAll}>Fill all left to send</button>}</div>
        {!dp ? <div className="sf-empty">{orderId ? 'Loading the order…' : 'Pick the sales order to see its products.'}</div> : (
          <table className="sf-t sf-pt">
            <colgroup><col style={{ width: 34 }} /><col /><col style={{ width: 72 }} /><col style={{ width: 84 }} /><col style={{ width: 64 }} /><col style={{ width: 84 }} /><col style={{ width: 110 }} /><col style={{ width: 104 }} /><col style={{ width: 58 }} /><col style={{ width: 96 }} /><col style={{ width: 110 }} /></colgroup>
            <thead>
              <tr className="grp"><th colSpan={2} /><th colSpan={4} className="c">So far</th><th colSpan={5} className="c now">On this DC</th></tr>
              <tr><th>Sl</th><th>Product</th><th className="r">Ordered</th><th className="r">Sent</th><th className="r">Billed</th><th className="r">Left to send</th><th className="r now first">Send now</th><th className="r now">Taxable</th><th className="r now">GST %</th><th className="r now">{intra ? 'CGST + SGST' : 'IGST'}</th><th className="r now">Amount</th></tr>
            </thead>
            <tbody>
              {dp.lines.map((l, i) => {
                const err = errs[l.idx], q = n(qty[l.idx]);
                return (
                  <tr key={l.idx} className={l.toSend <= 0 && !q ? 'off' : ''}>
                    <td>{i + 1}</td>
                    <td><div className="pn">{l.name}</div><div className="ps">{l.hsn ? `HSN ${l.hsn}` : 'No HSN'} · {l.unit}{l.dcQ || l.billQ ? ` · sent: ${num(l.dcQ)} on DC, ${num(l.billQ)} with bill` : ''}</div>{isMulti(l) ? splitSel(l) : fromSel(`p${l.idx}`, l.it, q)}</td>
                    <td className="r">{num(l.ordered)}</td><td className="r">{l.sent ? num(l.sent) : <span className="mut">0</span>}</td>
                    <td className="r">{l.billed ? num(l.billed) : <span className="mut">0</span>}</td>
                    <td className={`r ${l.toSend > 0 ? 'pend' : 'done'}`}>{l.toSend > 0 ? num(l.toSend) : '✓ Sent'}</td>
                    <td className="r now first">
                      <input className={`sf-q${err ? ' bad' : ''}`} inputMode="decimal" value={qty[l.idx] ?? ''} placeholder="0" disabled={(l.toSend <= 0 && !q) || isMulti(l)} title={isMulti(l) ? 'Total of the vendor lines' : undefined}
                        onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setQty(x => ({ ...x, [l.idx]: v })); }} aria-label={`Send qty for ${l.name}`} />
                      {err && <span className="sf-err">{err}</span>}
                    </td>
                    <td className="r now">{q ? amt(q * l.rate) : <span className="mut">—</span>}</td>
                    <td className="r now">{num(l.gstPct)}%</td>
                    <td className="r now">{q ? amt(q * l.rate * l.gstPct / 100) : <span className="mut">—</span>}</td>
                    <td className="r now"><b>{q ? amt(q * l.rate * (1 + l.gstPct / 100)) : '—'}</b></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={6}>Total on this DC</td>
              <td className="r now first">{num(sendItems.reduce((s, l) => s + n(qty[l.idx]), 0))}</td><td className="r now">{amt(value)}</td><td className="now" />
              <td className="r now">{amt(gstAmt)}</td><td className="r now">{amt(value + gstAmt)}</td></tr></tfoot>
          </table>
        )}
      </div>

      {dp && dp.addons.length > 0 && (
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="plus" size={13} /></span><b>Add-on items to send</b><small>price included in the products</small></div>
          <table className="sf-t">
            <thead><tr><th>Sl</th><th>Item</th><th>Specification</th><th className="r">Ordered</th><th className="r">Sent</th><th className="r">Left</th><th className="r">Send now</th></tr></thead>
            <tbody>{dp.addons.map((x, k) => (
              <tr key={x.i} className={x.toSend <= 0 && !n(aq[x.i]) ? 'off' : ''}>
                <td>{k + 1}</td><td><b>{x.a.description}</b>{fromSel(`a${x.i}`, { description: x.a.description }, n(aq[x.i]))}</td><td>{dash(x.a.remarks)}</td>
                <td className="r">{num(x.ordered)} <span className="mut">{x.a.unit || ''}</span></td><td className="r">{x.sent ? num(x.sent) : <span className="mut">0</span>}</td>
                <td className={`r ${x.toSend > 0 ? 'pend' : 'done'}`}>{x.toSend > 0 ? num(x.toSend) : '✓'}</td>
                <td className="r"><input className={`sf-q${errs[`a${x.i}`] ? ' bad' : ''}`} inputMode="decimal" value={aq[x.i] ?? ''} placeholder="0" disabled={x.toSend <= 0 && !n(aq[x.i])}
                  onChange={e => { const v = e.target.value.replace(/[^\d.]/g, ''); setAq(y => ({ ...y, [x.i]: v })); }} aria-label={`Send qty for ${x.a.description}`} />
                  {errs[`a${x.i}`] && <span className="sf-err">{errs[`a${x.i}`]}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {dp && dp.dcs.length > 0 && (
        <div className="sf-card">
          <div className="sf-ch"><span className="ico"><Svg name="ledger" size={13} /></span><b>DCs already made for this order</b></div>
          <table className="sf-t">
            <thead><tr><th>DC No.</th><th>Date</th><th>Type</th><th>Products</th><th>E-Way Bill</th></tr></thead>
            <tbody>{[...dp.dcs].sort((a, b) => String(a.dcDate || '').localeCompare(String(b.dcDate || ''))).map(d => (
              <tr key={d.dcId}><td className="sf-no">{d.dcNo || d.dcId}</td><td>{fdate(d.dcDate)}</td><td>{TYPE[d.dcType] || 'Material first'}</td>
                <td>{(d.items || []).map(li => `${li.description} × ${num(li.qty)}`).join('; ') || '—'}</td><td>{dash(d.ewayBillNo)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {msg && <div className={`sf-msg ${msg.k}`} role="status">{msg.t}</div>}
      <div className="sf-bar">
        <div className="info">{dp ? <>On this DC: <b>{num(sendItems.reduce((s, l) => s + n(qty[l.idx]), 0))}</b> qty · taxable ₹ {amt(value)} · GST ₹ {amt(gstAmt)} · total ₹ {amt(value + gstAmt)}{sendAddons.length ? ` · ${sendAddons.length} add-on item${sendAddons.length === 1 ? '' : 's'}` : ''}</> : 'Pick an order to start.'}</div>
        {editDc ? <button type="button" className="sf-b ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          : <button type="button" className="sf-b ghost" onClick={() => { reset(); setMsg(null); }} disabled={busy}>Clear</button>}
        <button type="button" className="sf-b pri" onClick={save} disabled={busy}>{busy ? 'Saving…' : editDc ? 'Update DC' : 'Save DC'}</button>
      </div>

      {picker && <OrderPicker rows={rows} onPick={r => { setPicker(false); if (String(r.o.orderId) !== orderId) { initFor.current = null; setOrderId(String(r.o.orderId)); setHead(h => ({ ...h, billId: '' })); } }} onClose={() => setPicker(false)} />}
    </div>
  );
}

function OrderPicker({ rows, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState(0);
  const inRef = useRef(null), listRef = useRef(null);
  useEffect(() => { inRef.current?.focus(); }, []);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(r => (all || r.state !== 'full') && (!w.length || w.every(x => `${r.o.orderNo} ${r.o.orderId} ${r.o.customerName || r.o.party} ${r.o.customerPO}`.toLowerCase().includes(x)))).slice(0, 300);
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
      <div className="sf-pk" role="dialog" aria-modal="true" aria-label="Select sales order" onKeyDown={key}>
        <div className="sf-pkh"><b>Select Sales Order</b><span className="grow" /><small>{list.length} found</small><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="sf-pks">
          <input type="text" ref={inRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search by order no., client or client PO…" aria-label="Search orders" />
          <label><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Include fully sent</label>
        </div>
        <div className="sf-pkl" ref={listRef}>
          <table className="sf-t">
            <thead><tr><th>Order No.</th><th>Date</th><th>Client</th><th>Client PO</th><th className="r">Ordered</th><th className="r">Sent</th><th className="r">Billed</th><th className="r">Left to send</th></tr></thead>
            <tbody>{list.length ? list.map((r, i) => (
              <tr key={r.o.orderId} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => onPick(r)}>
                <td className="sf-no">{r.o.orderNo || r.o.orderId}</td><td>{fdate(r.o.orderDate)}</td><td>{dash(r.o.customerName || r.o.party)}</td><td>{dash(r.o.customerPO)}</td>
                <td className="r">{num(r.orderQty)}</td><td className="r">{num(r.sentQty)}</td><td className="r">{num(r.billedQty)}</td>
                <td className="r" style={{ fontWeight: 700, color: r.toSend > 0 ? '#B54708' : '#067647' }}>{num(r.toSend)}</td>
              </tr>
            )) : <tr><td colSpan={8} className="sf-empty">{q ? `Nothing matches “${q}”.` : 'Nothing left to send.'}</td></tr>}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── DC List ── */
const DCOLS = [['', '2.4%', 'c'], ['DC Date', '6.2%'], ['DC No.', '9%'], ['Client', '11.6%'], ['Order No.', '8.6%'], ['Client PO', '10%'], ['Products', '20%'], ['Add-ons', '9%'],
  ['Qty', '4.4%', 'r'], ['E-Way Bill', '8%'], ['Vehicle', '7%'], ['Type', '7%', 'c'], ['Bill', '6.8%']];

function DCList({ dcs, soMap, companyId, slot, q, setQ, onPrint, onJson, onGenerate, onEwb, onHelper, busyJob, onEdit, onDeleted, setNote }) {
  const [printMenu, setPrintMenu] = useState(false);
  const [ewMenu, setEwMenu] = useState(false);
  useEffect(() => {
    if (!printMenu && !ewMenu) return undefined;
    const down = e => { if (!e.target.closest?.('.pm-wrap')) { setPrintMenu(false); setEwMenu(false); } };
    const key = e => { if (e.key === 'Escape') { setPrintMenu(false); setEwMenu(false); } };
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [printMenu, ewMenu]);
  const [askCancel, setAskCancel] = useState(null);   // { dc, reason, remarks, after }
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);   // current FY by default
  const [ticked, setTicked] = useState([]);   // DCs ticked for one e-way JSON file
  const [selId, setSelId] = useState(null);
  const [askDel, setAskDel] = useState(null);
  const [busy, setBusy] = useState(false);
  useClearSel(askDel ? null : selId, setSelId, '.sb-t tbody.og, .sb-tools, .sb-ask');
  const gone = d => d.status === 'deleted';
  const noOf = d => Number((String(d.dcNo || '').match(/(\d+)$/) || [])[1]) || 0;
  const all = useMemo(() => [...(dcs || [])].sort((a, b) => (gone(a) - gone(b)) || String(b.dcDate || '').localeCompare(String(a.dcDate || '')) || (noOf(b) - noOf(a))), [dcs]);   // deleted ones at the end
  const fyList = useMemo(() => fyCounts(all.filter(d => !d._gap), d => d.dcDate), [all]);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter(d => (!fySel.length || fySel.includes(fyOf(d.dcDate) || d._fy))
      && (!w.length || w.every(x => `${d.dcNo} ${d.dcId} ${d.customerName} ${d.orderNo} ${d.clientOrderNo || ''} ${d.ewayBillNo || ''} ${d.vehicleNo || ''} ${d.invoiceNo || ''} ${(d.items || []).map(i => i.description).join(' ')}`.toLowerCase().includes(x))));
  }, [all, fySel, q]);
  const sel = list.find(d => String(d.dcId) === selId && !gone(d)) || null;   // a deleted DC cannot be printed / edited / sent again
  const live = list.filter(d => !gone(d));
  const doDelete = async d => {
    setBusy(true);
    try { await axios.delete(`/api/delivery-challans/${d.dcId}`, { params: { companyId } }); setAskDel(null); setSelId(null); onDeleted(d); }
    catch (e) { setNote(e.response?.data?.error || 'Could not delete the DC.'); }
    finally { setBusy(false); }
  };
  const qtyOf = d => (d.items || []).reduce((s, i) => s + n(i.qty), 0);

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={all.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search DC, client, order, e-way…" aria-label="Search DCs" />
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.dcNo || sel.dcId}</b></> : 'Click a DC to select'}</span>
          {!ticked.length && sel && ewayActive(sel)
            ? <button type="button" className="sb-tbtn gen" disabled={busyJob} title="Read this e-way bill's details again from the portal (valid upto, distance, status)"
              onClick={() => onEwb('check', sel)}><Svg name="refresh" size={13} />Refresh E-Way</button>
            : <button type="button" className="sb-tbtn gen" disabled={(!ticked.length && !sel) || busyJob} title="Open the e-way portal on this PC through the E-Way Helper and generate"
              onClick={async () => { const pick = ticked.length ? list.filter(d => ticked.includes(String(d.dcId))) : [sel]; if (await onGenerate(pick)) setTicked([]); }}>
              <Svg name="spark" size={13} />Generate E-Way{ticked.length ? ` (${ticked.length})` : ''}</button>}
          {/* the other e-way actions in one menu, so every button fits the bar */}
          <span className="pm-wrap ew-wrap">
            <button type="button" className="sb-tbtn" aria-haspopup="menu" aria-expanded={ewMenu} onClick={() => setEwMenu(m => !m)}><Svg name="swap" size={13} />E-Way ▾</button>
            {ewMenu && (() => {
              const canJson = !!(ticked.length || sel);
              const canCancel = !!sel && ewayActive(sel) && !busyJob && (cancelHoursLeft(sel) ?? 1) > 0;
              const close = () => setEwMenu(false);
              return (
                <span className="pm-menu" role="menu">
                  <button type="button" role="menuitem" disabled={!canJson} onClick={() => { close(); const pick = ticked.length ? list.filter(d => ticked.includes(String(d.dcId))) : [sel]; if (onJson(pick)) setTicked([]); }}>
                    <b>E-Way JSON{ticked.length ? ` (${ticked.length})` : ''}</b><small>Download the file for the portal (tick DCs for several)</small></button>
                  <button type="button" role="menuitem" className="danger" disabled={!canCancel} onClick={() => { close(); setAskDel(null); setAskCancel({ dc: sel, reason: 2, remarks: '', after: '' }); }}>
                    <b>Cancel E-Way</b><small>{sel && ewayActive(sel) && (cancelHoursLeft(sel) ?? 1) <= 0 ? 'Not possible — 24 hours are over' : 'Cancel the e-way bill on the portal'}</small></button>
                  <button type="button" role="menuitem" disabled={!sel?.ewayBillNo || busyJob} onClick={() => { close(); onEwb('check', sel); }}>
                    <b>Check on portal</b><small>Active, validity over, or cancelled — read again from the portal</small></button>
                  <button type="button" role="menuitem" onClick={() => { close(); onHelper(); }}><b>E-Way Helper</b><small>Start it / set up this PC</small></button>
                </span>
              );
            })()}
          </span>
          <span className="pm-wrap">
            <button type="button" className="sb-tbtn" disabled={!sel} aria-haspopup="menu" aria-expanded={printMenu} onClick={() => setPrintMenu(m => !m)}><Svg name="file" size={13} />Print ▾</button>
            {printMenu && sel && (
              <span className="pm-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => { setPrintMenu(false); onPrint(sel, true); }}><b>With value</b><small>Rate, GST and amount</small></button>
                <button type="button" role="menuitem" onClick={() => { setPrintMenu(false); onPrint(sel, false); }}><b>Without value</b><small>Quantities only</small></button>
              </span>
            )}
          </span>
          <button type="button" className="sb-tbtn" disabled={!sel} onClick={() => onEdit(sel)}><Svg name="settings" size={13} />Edit</button>
          <button type="button" className="sb-tbtn del" disabled={!sel || busyJob} onClick={() => { setAskCancel(null); setAskDel(sel); }}><Svg name="x" size={13} />Delete</button>
        </div>
      </>, slot)}
      {askDel && !ewayActive(askDel) && (
        <div className="sb-ask" role="alertdialog" aria-label="Confirm delete">
          <span><b>Delete DC {askDel.dcNo || askDel.dcId}</b> of order {askDel.orderNo || '—'}?{askDel.ewayBillNo ? ` Its e-way bill ${askDel.ewayBillNo} is already cancelled.` : ''} Its quantities go back to “left to send” and its stock entry is removed. This cannot be undone.</span>
          <button type="button" className="sb-abtn" onClick={() => setAskDel(null)} disabled={busy}>Keep</button>
          <button type="button" className="sb-abtn danger" onClick={() => doDelete(askDel)} disabled={busy}>{busy ? 'Deleting…' : 'Yes, delete'}</button>
        </div>
      )}
      {askDel && ewayActive(askDel) && (() => {
        const left = cancelHoursLeft(askDel), canCancel = left == null || left > 0;
        return (
          <div className="sb-ask" role="alertdialog" aria-label="E-way bill on this DC">
            <span><b>DC {askDel.dcNo || askDel.dcId} has e-way bill {askDel.ewayBillNo}</b>{askDel.ewayGenDate ? ` (generated ${askDel.ewayGenDate})` : ''}.{' '}
              {canCancel ? <>Is it cancelled on the portal? {left != null && <>({Math.floor(left)} h {Math.round((left % 1) * 60)} min left to cancel.)</>}</> : <>The 24 hours to cancel it on the portal are over.</>}</span>
            {canCancel && <button type="button" className="sb-abtn danger" onClick={() => { setAskCancel({ dc: askDel, reason: 2, remarks: '', after: 'delete' }); setAskDel(null); }}>Not cancelled — cancel it now, then delete</button>}
            <button type="button" className="sb-abtn" onClick={async () => { if (await onEwb('check', askDel, { after: 'delete' })) setAskDel(null); }}>Already cancelled — check on portal, then delete</button>
            {!canCancel && <button type="button" className="sb-abtn danger" onClick={() => doDelete(askDel)} disabled={busy}>Delete anyway</button>}
            <button type="button" className="sb-abtn" onClick={() => setAskDel(null)}>Keep DC</button>
          </div>
        );
      })()}
      {askCancel && (
        <div className="sb-ask" role="alertdialog" aria-label="Cancel e-way bill">
          <span><b>Cancel e-way bill {askCancel.dc.ewayBillNo}</b> of DC {askCancel.dc.dcNo || askCancel.dc.dcId} on the portal{askCancel.after === 'delete' ? ', then delete the DC' : ''}? Reason
            <select className="ew-sel" value={askCancel.reason} onChange={e => setAskCancel(a => ({ ...a, reason: +e.target.value }))} aria-label="Reason">{CANCEL_REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input className="ew-rm" value={askCancel.remarks} onChange={e => setAskCancel(a => ({ ...a, remarks: e.target.value.slice(0, 50) }))} placeholder="Remarks (optional)" aria-label="Remarks" /></span>
          <button type="button" className="sb-abtn" onClick={() => setAskCancel(null)}>Back</button>
          <button type="button" className="sb-abtn danger" onClick={async () => { if (await onEwb('cancel', askCancel.dc, askCancel)) setAskCancel(null); }}>Cancel on portal</button>
        </div>
      )}
      <div className="sb-kpi" aria-label="Totals of the DCs shown">
        <div className="sb-k"><small>DCs</small><b>{live.length}{list.length > live.length ? <span style={{ fontSize: 11, color: '#B42318', fontWeight: 600 }}> + {list.length - live.length} deleted</span> : null}</b></div>
        <div className="sb-k"><small>Material first</small><b>{live.filter(d => !d.dcType || d.dcType === 'before-bill').length}</b></div>
        <div className="sb-k"><small>With / against bill</small><b>{live.filter(d => d.dcType === 'against-bill' || d.dcType === 'with-bill').length}</b></div>
        <div className="sb-k ok"><small>Value sent</small><b>₹ {BIG.format(live.reduce((s, d) => s + (n(d.totalValue) || (d.items || []).reduce((t, i) => t + n(i.qty) * n(i.rate), 0)), 0))}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t">
          <colgroup>{DCOLS.map(([h, w]) => <col key={h || 'tick'} style={{ width: w }} />)}</colgroup>
          <thead><tr>{DCOLS.map(([h, , a]) => <th key={h || 'tick'} className={a || ''}>{h || <input type="checkbox" aria-label="Tick all shown" checked={!!live.length && live.every(d => ticked.includes(String(d.dcId)))} onChange={e => setTicked(e.target.checked ? live.map(d => String(d.dcId)) : [])} />}</th>)}</tr></thead>
          {dcs === null ? <tbody><tr><td colSpan={13} className="sb-empty">Loading…</td></tr></tbody>
            : !list.length ? <tbody><tr><td colSpan={13} className="sb-empty">{q ? `No DC matches “${q}”.` : 'No delivery challans yet.'}</td></tr></tbody> : null}
          {dcs !== null && list.map(d => {
            const so = soMap[String(d.linkedSalesOrderId)] || {};
            return (
              <tbody key={d.dcId} className={`og${selId === String(d.dcId) && !gone(d) ? ' sel' : ''}${gone(d) ? ' gone' : ''}`} onClick={() => setSelId(gone(d) ? null : String(d.dcId))} onDoubleClick={() => { if (gone(d)) return; setSelId(String(d.dcId)); onEdit(d); }}
                title={d._gap ? 'Deleted before deleted DCs were kept — its details are not available' : gone(d) ? `Deleted${d.deletedBy ? ` by ${d.deletedBy}` : ''}${d.deletedAt ? ` on ${sdate(d.deletedAt)}` : ''} — kept in the list, sends nothing` : 'Click to select · double-click to edit'} aria-selected={selId === String(d.dcId)}>
                <tr>
                  <td className="c keep" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Tick ${d.dcNo || d.dcId} for the e-way JSON`} checked={ticked.includes(String(d.dcId))} disabled={gone(d)}
                    onChange={e => setTicked(t => (e.target.checked ? [...t, String(d.dcId)] : t.filter(x => x !== String(d.dcId))))} /></td>
                  <td className="nw">{sdate(d.dcDate)}</td><td className="bno">{d.dcNo || d.dcId}</td><td className="cl">{dash(d.customerName || so.customerName)}</td>
                  <td className="no">{dash(d.orderNo || so.orderNo)}</td><td>{dash(d.clientOrderNo || so.customerPO)}</td>
                  <td>{(d.items || []).map(li => `${li.description || li.itemName} × ${num(li.qty)}`).join('; ') || <span className="mut">—</span>}</td>
                  <td>{(d.addons || []).filter(a => n(a.qty) > 0).map(a => `${a.description} × ${num(a.qty)}`).join('; ') || <span className="mut">—</span>}</td>
                  <td className="r">{num(qtyOf(d))}</td><td className="nw">{d.ewayBillNo ? (d.ewayStatus === 'cancelled' ? <span title="This e-way bill is cancelled on the portal"><span className="ew-no-x">{d.ewayBillNo}</span><span className="ew-cx">✕ Cancelled</span></span>
                    : d.ewayStatus === 'expired' ? <span title="Not active on the portal — its validity is over (not cancelled)">{d.ewayBillNo}<span className="ew-cx ew-exp">Validity over</span></span> : d.ewayBillNo) : <span className="mut">—</span>}</td><td className="nw">{dash(d.vehicleNo)}</td>
                  <td className="c keep">{d._gap ? <span className="px-tag del" title="Deleted before deleted DCs were kept — details not available">Deleted earlier</span> : gone(d) ? <span className="px-tag del" title={`Deleted${d.deletedBy ? ` by ${d.deletedBy}` : ''}${d.deletedAt ? ` on ${sdate(d.deletedAt)}` : ''}`}>Deleted{d.deletedAt ? ` ${sdate(d.deletedAt)}` : ''}</span>
                    : <span className={`dc-tag ${d.dcType === 'before-bill' || !d.dcType ? 'mf' : 'ab'}`}>{TYPE[d.dcType] || 'Material first'}</span>}</td>
                  <td>{d.invoiceNo || d.linkedInvoiceNo ? <span className="bno">{d.invoiceNo || d.linkedInvoiceNo}</span> : gone(d) ? <span className="mut">—</span> : <span className="mut">Bill pending</span>}</td>
                </tr>
              </tbody>
            );
          })}
        </table>
      </div>
    </>
  );
}

/* ── Dispatch Status: what has gone, what is left, and how it lines up with billing ── */
/* number columns are narrow (their headings wrap); the room goes to client and product */
const SCOLS = [['Order No.', '8.4%'], ['Client', '15%'], ['Client PO', '10%'], ['Product', '28%'], ['Ordered', '4.4%', 'r'], ['Sent on DC', '4.4%', 'r'], ['Sent (old bills)', '4.6%', 'r'],
  ['Billed', '4.2%', 'r'], ['To Send', '4.4%', 'r'], ['Sent, not billed', '5%', 'r'], ['Billed, not sent', '5%', 'r'], ['DCs', '3.6%', 'c'], ['St.', '3%', 'c']];

function DispatchStatus({ rows, loading, bills, dcs, slot, onDc, onDcs }) {
  const [fySel, setFySel] = useState(() => [fyOf(new Date())]);   // current FY by default
  const [showDone, setShowDone] = useState(false);
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(null);
  useClearSel(selId, setSelId, '.sb-t tbody.og, .sb-tools');
  const fyList = useMemo(() => fyCounts(rows, r => r.o.orderDate), [rows]);
  const inFy = useMemo(() => rows.filter(r => !fySel.length || fySel.includes(fyOf(r.o.orderDate))), [rows, fySel]);
  const open = r => r.state !== 'full' || r.sentNotBilled > 0 || r.billedNotSent > 0 || r.addons.some(x => x.toSend > 0);
  const doneCount = inFy.filter(r => !open(r)).length;
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return inFy.filter(r => (showDone || open(r))
      && (!w.length || w.every(x => `${r.o.orderNo} ${r.o.customerName || r.o.party} ${r.o.customerPO} ${r.lines.map(l => l.name).join(' ')}`.toLowerCase().includes(x))));
  }, [inFy, q, showDone]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sel = list.find(r => String(r.o.orderId) === selId) || null;
  const sum = k => list.reduce((s, r) => s + r[k], 0);
  // how material went — counted over the orders in the chosen FY
  const ids = new Set(inFy.map(r => String(r.o.orderId)));
  const fyBills = bills.filter(b => ids.has(String(b.orderId))), fyDcs = dcs.filter(d => ids.has(String(d.linkedSalesOrderId)));
  const withBill = fyBills.filter(b => billMode(b) === 'with-bill').length;
  const dcFirst = fyDcs.filter(d => !d.dcType || d.dcType === 'before-bill').length;
  const billFirst = fyBills.filter(b => billMode(b) === 'before-dc').length;

  return (
    <>
      {slot && createPortal(<>
        <FyFilter list={fyList} total={rows.length} sel={fySel} setSel={setFySel} />
        <input className="sb-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search order, client, PO, product…" aria-label="Search orders" />
        <label className={`sb-chk${showDone ? ' on' : ''}`} title="Show orders where everything is sent and billed">
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />Show completed <small>{doneCount}</small>
        </label>
        <div className="sb-tools">
          <span className="sb-picked">{sel ? <>Selected: <b>{sel.o.orderNo || sel.o.orderId}</b></> : 'Double-click an order to make its DC'}</span>
          <button type="button" className="sb-tbtn" disabled={!sel || (sel.toSend <= 0 && !sel.addons.some(x => x.toSend > 0))} onClick={() => onDc(sel)}><Svg name="swap" size={13} />Create DC</button>
        </div>
      </>, slot)}
      <div className="sb-kpi dc-kpi6" aria-label="How material went">
        <div className="sb-k" title="Bills where the material went with the tax invoice (e-invoice + e-way bill)"><small>With bill</small><b>{withBill}</b></div>
        <div className="sb-k" title="DCs sent before the bill (material first, bill later)"><small>DC first, bill later</small><b>{dcFirst}</b></div>
        <div className="sb-k" title="Bills made before the material went (material follows on DC)"><small>Bill first, DC later</small><b>{billFirst}</b></div>
        <div className="sb-k due"><small>Qty to send</small><b>{num(sum('toSend'))}</b></div>
        <div className="sb-k due" title="Material has gone but the bill is not made yet"><small>Sent, not billed</small><b>{num(sum('sentNotBilled'))}</b></div>
        <div className="sb-k due" title="Bill made but the material has not gone yet"><small>Billed, not sent</small><b>{num(sum('billedNotSent'))}</b></div>
      </div>
      <div className="sb-list">
        <table className="sb-t ds">
          <colgroup>{SCOLS.map(([h, w]) => <col key={h} style={{ width: w }} />)}</colgroup>
          <thead><tr>{SCOLS.map(([h, , a]) => <th key={h} className={a || ''} title={h}>{h}</th>)}</tr></thead>
          {loading ? <tbody><tr><td colSpan={13} className="sb-empty">Loading…</td></tr></tbody>
            : !list.length ? <tbody><tr><td colSpan={13} className="sb-empty">{q ? `No order matches “${q}”.` : 'Nothing pending — every order is sent and billed. Tick “Show completed” to see them.'}</td></tr></tbody>
              : list.map(r => {
                // add-on items (AC, TV … included in the price) are listed under the products — sent on DCs, never billed
                const lines = [...r.lines, ...r.addons.map(x => ({ addon: x }))];
                if (!lines.length) lines.push(null);
                const span = lines.length, id = String(r.o.orderId), st = STATE[r.state];
                const adLeft = r.addons.reduce((s, x) => s + x.toSend, 0);
                return (
                  <tbody key={id} className={`og${selId === id ? ' sel' : ''}`} onClick={() => setSelId(id)} onDoubleClick={() => { setSelId(id); if (r.toSend > 0 || adLeft > 0) onDc(r); }}
                    title="Click to select · double-click to make a DC" aria-selected={selId === id}>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        {i === 0 && <>
                          <td rowSpan={span} className="no">{r.o.orderNo || r.o.orderId}</td>
                          <td rowSpan={span} className="cl">{dash(r.o.customerName || r.o.party)}</td>
                          <td rowSpan={span}>{dash(r.o.customerPO)}</td>
                        </>}
                        {l && l.addon ? <>
                          <td title="Add-on item — included in the price, sent on the DC"><span className="ds-ad">Add-on</span>{l.addon.a.description}</td>
                          <td className="r">{num(l.addon.ordered)}</td>
                          <td className="r">{l.addon.sent ? num(l.addon.sent) : <span className="mut">0</span>}</td>
                          <td className="r mut">—</td>
                          <td className="r mut">—</td>
                          <td className={`r ${l.addon.toSend > 0 ? 'pend' : 'done'}`}>{l.addon.toSend > 0 ? num(l.addon.toSend) : '✓'}</td>
                          <td className="r mut">—</td>
                          <td className="r mut">—</td>
                        </> : l ? <>
                          <td>{l.name}</td>
                          <td className="r">{num(l.ordered)}</td>
                          <td className="r">{l.dcQ ? num(l.dcQ) : <span className="mut">0</span>}</td>
                          <td className="r">{l.billQ ? num(l.billQ) : <span className="mut">0</span>}</td>
                          <td className="r">{l.billed ? num(l.billed) : <span className="mut">0</span>}</td>
                          <td className={`r ${l.toSend > 0 ? 'pend' : 'done'}`}>{l.toSend > 0 ? num(l.toSend) : '✓'}</td>
                          <td className={`r ${l.sentNotBilled > 0 ? 'warn' : 'mut'}`}>{l.sentNotBilled > 0 ? num(l.sentNotBilled) : '—'}</td>
                          <td className={`r ${l.billedNotSent > 0 ? 'warn' : 'mut'}`}>{l.billedNotSent > 0 ? num(l.billedNotSent) : '—'}</td>
                        </> : <td colSpan={8} className="c mut">No products</td>}
                        {i === 0 && <>
                          <td rowSpan={span} className="c">{r.dcs.length
                            ? <button type="button" className="sb-cnt" title="Double-click to see these DCs" onClick={e => e.stopPropagation()} onDoubleClick={e => { e.stopPropagation(); onDcs(r); }}>{r.dcs.length}</button>
                            : <span className="mut">0</span>}</td>
                          <td rowSpan={span} className="c"><span className="sb-dot" style={{ background: st[1] }} title={st[2]}>{st[0]}</span></td>
                        </>}
                      </tr>
                    ))}
                  </tbody>
                );
              })}
        </table>
      </div>
    </>
  );
}

/* start the helper on this PC through the "epsilon-eway://" link the setup registered */
/* Step-by-step progress of an e-way job (same look as the GST search). The helper reports a status per step;
   the bar creeps forward inside a step and jumps when the next one starts, so it never looks stuck. */
const EW_STEPS = kind => [
  { label: 'Connecting to the helper', st: ['queued'], lo: 0, hi: 8, tau: 1.5 },
  { label: 'Opening the e-way portal', st: ['picked'], lo: 8, hi: 18, tau: 4 },
  { label: 'Login captcha — type it', st: ['captcha'], lo: 20, hi: 20, tau: 1, wait: true },
  { label: 'Logging in', st: ['login'], lo: 22, hi: 38, tau: 3 },
  ...(kind === 'generate' || !kind ? [
    { label: 'Opening bulk generation', st: ['bulk'], lo: 38, hi: 52, tau: 4 },
    { label: 'Uploading the JSON', st: ['upload'], lo: 52, hi: 64, tau: 3 },
    { label: 'Generating e-way bills', st: ['generate'], lo: 64, hi: 84, tau: 5 },
    { label: 'Reading valid upto / distance', st: ['details'], lo: 84, hi: 97, tau: 4 },
  ] : [
    { label: kind === 'cancel' ? 'Cancelling on the portal' : 'Checking on the portal', st: null, lo: 40, hi: 96, tau: 6 },
  ]),
];

function EwayProgress({ job, onCancel }) {
  const steps = EW_STEPS(job.kind);
  const known = steps.findIndex(x => x.st && x.st.includes(job.status));
  const last = useRef(0);
  // a status not in the list (e.g. 'check', 'cancel') is the last step; never go back to an earlier step
  const idx = Math.max(last.current, known >= 0 ? known : steps.length - 1);
  last.current = idx;
  const t0 = useRef(Date.now());
  const at = useRef({ idx, t: Date.now() });
  if (at.current.idx !== idx) at.current = { idx, t: Date.now() };
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 200); return () => clearInterval(id); }, []);
  const st = steps[idx];
  const pct = Math.round(st.lo + (st.hi - st.lo) * (1 - Math.exp(-((Date.now() - at.current.t) / 1000) / st.tau)));
  const secs = Math.floor((Date.now() - t0.current) / 1000);
  return (
    <div className={`ewp${st.wait ? ' wait' : ''}`} role="status" aria-live="polite">
      <div className="ewp-top">
        <b>{st.label} <span className="pc">· E-Way Helper{job.machine ? ` · ${job.machine}` : ''}</span></b>
        <span className="t">{pct}% · {secs}s</span>
        <button type="button" className="sb-abtn" onClick={onCancel}>Cancel</button>
      </div>
      <div className="ewp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="E-way progress">
        <div className="ewp-fill" style={{ width: `${pct}%` }} />
      </div>
      <ol className="ewp-steps">
        {steps.map((x, i) => (
          <li key={x.label} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
            <span className="ic">{i < idx ? '✓' : i === idx ? <span className="ewp-spin" /> : '○'}</span>{x.label}
          </li>
        ))}
      </ol>
      {job.message && job.status !== 'captcha' && <div className="ewp-msg">{job.message}</div>}
    </div>
  );
}

/* the e-way portal login captcha, typed here: the helper on this PC sends its picture, fills what is typed and logs in */
function EwayCaptcha({ job, onStop, inline }) {
  const [val, setVal] = useState('');
  const [sent, setSent] = useState(null);   // the captcha no. already answered
  const [err, setErr] = useState('');
  const seq = job.captchaSeq;
  const inRef = useRef(null);
  useEffect(() => { setVal(''); setErr(''); setTimeout(() => inRef.current?.focus(), 50); }, [seq]);
  const send = async refresh => {
    if (sent === seq || (!refresh && !val.trim())) return;
    setSent(seq); setErr('');
    try { await axios.post(`/api/eway-helper/jobs/${job.id}/captcha`, refresh ? { seq, refresh: true } : { seq, answer: val.trim() }); }
    catch (e) { setSent(null); setErr(e.response?.data?.error || 'Could not send — try again.'); }
  };
  const busy = sent === seq;
  const warn = /not accepted|again/i.test(job.message || '');
  if (inline) return (
    <form className="ec-in" onSubmit={e => { e.preventDefault(); send(false); }}>
      <div className="ec-lb">User id and password are filled from the Password Manager. Type the characters in the picture.</div>
      <div className="ec-img">
        <img src={job.captchaImg} alt="Captcha from the e-way portal" />
        <button type="button" className="ec-new" disabled={busy} onClick={() => send(true)}><Svg name="refresh" size={14} />New picture</button>
      </div>
      <div className="ec-row">
        <input ref={inRef} value={val} onChange={e => setVal(e.target.value.replace(/\s/g, ''))} maxLength={12} autoComplete="off" placeholder="Characters shown above" disabled={busy} aria-label="Captcha" />
        <button type="submit" className="ec-go" disabled={busy || !val.trim()}>{busy ? 'Logging in…' : 'Login'}</button>
      </div>
      {(err || (warn && !busy)) && <div className={err ? 'hb-err' : 'ec-warn'}>{err || job.message}</div>}
    </form>
  );
  return (
    <div className="hb-back" style={{ alignItems: 'center', padding: 16 }}>
      <form className="hb ec" role="dialog" aria-modal="true" aria-labelledby="ec-t" onSubmit={e => { e.preventDefault(); send(false); }}>
        <div className="hb-hd"><b id="ec-t">E-way portal login</b><span className="ec-pc">{job.machine || ''}</span></div>
        <div className="hb-bd">
          <div className="ec-lb">User id and password are filled from the Password Manager. Type the characters in the picture.</div>
          <div className="ec-img">
            <img src={job.captchaImg} alt="Captcha from the e-way portal" />
            <button type="button" className="ec-new" disabled={busy} onClick={() => send(true)}><Svg name="refresh" size={14} />New picture</button>
          </div>
          <div className="ec-row">
            <input ref={inRef} value={val} onChange={e => setVal(e.target.value.replace(/\s/g, ''))} maxLength={12} autoComplete="off" placeholder="Characters shown above" disabled={busy} aria-label="Captcha" />
            <button type="submit" className="ec-go" disabled={busy || !val.trim()}>{busy ? 'Logging in…' : 'Login'}</button>
          </div>
          {(err || (warn && !busy)) && <div className={err ? 'hb-err' : 'ec-warn'}>{err || job.message}</div>}
          {busy && <div className="hb-msg">Logging in to the e-way portal…</div>}
          <div className="ec-ft"><button type="button" className="ec-stop" onClick={onStop}>Stop</button></div>
        </div>
      </form>
    </div>
  );
}

export function startHelperOnThisPC() {
  const a = document.createElement('a'); a.href = 'epsilon-eway://start'; a.style.display = 'none';
  document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
}
/* wait (up to ms) until one of this user's helpers reports in */
export async function waitHelperOnline(ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await axios.get('/api/eway-helper/status'); if ((r.data || []).some(p => p.online)) return true; } catch { /* keep trying */ }
    await new Promise(r => setTimeout(r, 1500));
  }
  return false;
}
/* the one-time setup file for this PC: ERP address + a fresh pairing code inside */
async function downloadSetup() {
  const r = await axios.get('/api/eway-helper/setup', { params: { erp: window.location.origin }, responseType: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(r.data); a.download = 'EpsilonEwayHelper-Setup.cmd';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/* E-Way Helper: start it, set it up on this PC, or see which PCs are paired */
export function HelperBox({ onClose }) {
  const [pcs, setPcs] = useState(null);
  const [code, setCode] = useState(null);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = () => axios.get('/api/eway-helper/status').then(r => setPcs(r.data || [])).catch(e => { setPcs([]); setErr(e.response?.data?.error || 'The server does not know the E-Way Helper yet — restart the backend.'); });
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  const pair = () => axios.post('/api/eway-helper/pair/start').then(r => setCode(r.data.code)).catch(e => setErr(e.response?.data?.error || 'Could not make a code.'));
  const remove = id => axios.delete(`/api/eway-helper/helpers/${id}`).then(load);
  const ago = d => { const s = Math.round((Date.now() - new Date(d).getTime()) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(d).toLocaleString('en-IN'); };
  const running = (pcs || []).some(p => p.online);
  const start = async () => {
    setErr(''); setMsg('Starting the helper on this PC…'); setBusy('start');
    startHelperOnThisPC();
    const ok = await waitHelperOnline(15000);
    setBusy(''); load();
    setMsg(ok ? 'The helper is running.' : '');
    if (!ok) setErr('It did not start. If this PC was never set up, click “Download setup” first (one time). If Chrome asked “Open Epsilon E-Way Helper?”, click Open.');
  };
  const setup = async () => {
    setErr(''); setBusy('setup');
    try { await downloadSetup(); setMsg('Setup downloaded — open the file (EpsilonEwayHelper-Setup.cmd) once. It installs, pairs and starts the helper. This box turns green when it is running.'); }
    catch (e) { setErr('Could not download the setup — restart the backend and try again.'); }
    finally { setBusy(''); }
  };
  return (
    <div className="hb-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{HB_CSS}</style>
      <div className="hb" role="dialog" aria-modal="true" aria-label="E-Way Helper">
        <div className="hb-hd"><Svg name="settings" size={15} /><b>E-Way Helper</b><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="hb-bd">
          <div className={`hb-state${running ? ' on' : ''}`}><span className="s" />{pcs === null ? 'Checking…' : running ? 'The helper is running — Generate / Cancel E-Way will work.' : 'The helper is not running.'}</div>
          <div className="hb-acts">
            <button type="button" className="hb-big pri" onClick={start} disabled={!!busy || running}><Svg name="spark" size={15} />{busy === 'start' ? 'Starting…' : 'Start Helper'}</button>
            <button type="button" className="hb-big" onClick={setup} disabled={!!busy}><Svg name="file" size={15} />{busy === 'setup' ? 'Preparing…' : 'Download setup (first time on this PC)'}</button>
          </div>
          {msg && <div className="hb-msg">{msg}</div>}
          {err && <div className="hb-err">{err}</div>}
          <h4>Your PCs</h4>
          {pcs === null ? 'Loading…' : !pcs.length ? <div style={{ color: '#667085' }}>No PC is set up yet — use “Download setup”.</div> : pcs.map(p => (
            <div key={p.id} className="hb-pc"><span className="s" style={{ background: p.online ? '#16A34A' : '#98A2B3' }} />
              <span className="m">{p.machine}</span><span>{p.online ? (p.busy ? 'Running · working on a job' : 'Running') : `Not running · last seen ${ago(p.lastSeen)}`}</span>
              <button type="button" className="sb-abtn" onClick={() => remove(p.id)}>Remove</button></div>
          ))}
          <button type="button" className="hb-link" onClick={() => setManual(m => !m)}>{manual ? 'Hide' : 'Set up by hand (pairing code)'}</button>
          {manual && <>
            <ol>
              <li>Copy the <code>eway-helper</code> folder to the PC and run <code>setup.bat</code> (needs Node.js once).</li>
              <li>When it asks, type the ERP address and this code:</li>
            </ol>
            {code ? <div className="hb-code">{code}</div> : <button type="button" className="sb-abtn" style={{ margin: '8px 0' }} onClick={pair}>Make a pairing code</button>}
          </>}
        </div>
      </div>
    </div>
  );
}
