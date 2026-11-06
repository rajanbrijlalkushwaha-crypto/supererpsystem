/* Beta — Create Sales Order.
 * Layout: Client | Order details → Bill To | Ship To (with GSTIN) → Products → Additional charges (with GST)
 *         → Charges without GST → Item-wise specs → Attachments.
 * Saves exactly like the classic SO form (POST /api/sales-orders, same field names), so the classic
 * SO screens, print and approvals keep working on these orders. */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Svg } from '../../components/ui/Icon';

const TEAL = '#03444f';
const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Chandigarh', 'Puducherry', 'Ladakh',
];
const GST_RATES = [0, 5, 12, 18, 28];
const UNITS = ['NOS', 'Kg', 'Ltr', 'Mtr', 'Box', 'Pcs', 'Set', 'Sqft', 'MT'];
const CHARGE_TYPES = ['Packing & Forwarding', 'Freight / Courier', 'Insurance', 'Loading / Unloading',
  'Erection & Commissioning', 'Documentation', 'Other'];
const MAX_MB = 20;

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const n = v => parseFloat(v) || 0;
const num = v => (Number(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const r2 = v => Math.round(v * 100) / 100;
const amt = v => (Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fileSize = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const extOf = name => String(name || '').split('.').pop().slice(0, 4);

const newItem = () => ({ _id: uid(), type: 'Manufactured', source: 'buy', itemCode: '', description: '', hsnCode: '', dueDate: '', qty: 1, unit: 'NOS', rate: '', gst: 18, bom: [] });
/* a charge is either a typed amount (mode 'amount') or a % of the products' taxable value (mode 'pct') */
const newCharge = () => ({ _id: uid(), chargeType: 'Packing & Forwarding', description: '', mode: 'amount', pct: '', amount: '', gst: 18 });
/* add-on items: supplied with the order (AC, TV, fridge, furniture…), price already inside the product rate.
   Same shape the classic order / delivery challan / PO screens use. */
const ADDON_CATS = ['Accessory', 'Spare Part', 'AMC', 'Free Item', 'Documentation', 'Training', 'Other'];
const ADDON_QUICK = ['AC', 'TV', 'Fridge', 'Table', 'Chair'];
const newAddon = (description = '', forItem = '') => ({ _id: uid(), description, itemCode: '', forItem, perUnit: '1', category: 'Accessory', qty: '1', unit: 'NOS', includedInPrice: true, remarks: '' });
const chargeAmt = (c, taxable) => (c.mode === 'pct' ? taxable * n(c.pct) / 100 : n(c.amount));
const newPlain = () => ({ _id: uid(), description: '', amount: '' });

const EMPTY = {
  orderNo: '', orderDate: today(), quotationRef: '', quotationDate: '', customerPO: '', poDate: '', paymentTerms: '',
  clientId: '', customerName: '', contactPerson: '', mobile: '', email: '',
  billName: '', billAddress: '', billCity: '', billState: '', billPincode: '', billGstin: '', billContact: '', billMobile: '',
  shipName: '', shipAddress: '', shipCity: '', shipState: '', shipPincode: '', shipGstin: '', shipContact: '', shipMobile: '',
};

const CSS = `
.so { flex:1; min-height:0; overflow-y:auto; background:#EEF4F4; display:flex; flex-direction:column; font-family:${F}; }
.so-in { flex:1; padding:14px 16px 18px; }
.so-hero { display:flex; align-items:center; gap:14px; padding:14px 20px; margin-bottom:14px; border-radius:10px; color:#fff; position:relative; overflow:hidden;
  background:linear-gradient(120deg, ${TEAL} 0%, #05606F 60%, #0A7A86 100%); box-shadow:0 6px 18px rgba(3,68,79,.22); }
.so-hero::after { content:''; position:absolute; right:-60px; top:-80px; width:260px; height:260px; border-radius:50%; background:rgba(255,255,255,.06); }
.so-hero .ic { width:44px; height:44px; border-radius:12px; display:grid; place-items:center; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22); flex-shrink:0; }
.so-hero h1 { margin:0; font-size:19px; font-weight:700; }
.so-hero p { margin:3px 0 0; font-size:12.5px; color:rgba(255,255,255,.78); }
.so-hero .grow { flex:1; }
.so-chip { position:relative; z-index:1; display:flex; flex-direction:column; align-items:flex-end; padding:6px 14px; border-radius:8px; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.22); }
.so-chip small { font-size:10.5px; color:rgba(255,255,255,.72); text-transform:uppercase; letter-spacing:.6px; }
.so-chip b { font-size:16px; font-family:ui-monospace, Consolas, monospace; }

.so-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; align-items:stretch; }
.so-card { background:#fff; border:1px solid #D7E3E5; border-radius:10px; overflow:hidden; box-shadow:0 1px 3px rgba(16,24,40,.05); margin-bottom:14px; }
.so-2 > .so-card { margin-bottom:0; }
.so-ch { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid #EDF2F3; background:linear-gradient(180deg,#FBFDFD,#F5F9F9); }
.so-ch .ico { width:30px; height:30px; border-radius:8px; display:grid; place-items:center; background:#E1EFF0; color:${TEAL}; flex-shrink:0; }
.so-ch .t b { display:block; font-size:13.5px; color:#101828; }
.so-ch .t small { display:block; font-size:11.5px; color:#667085; margin-top:1px; }
.so-ch .grow { flex:1; }
.so-ch .cnt { padding:2px 8px; border-radius:99px; background:#E1EFF0; color:${TEAL}; font-size:11px; font-weight:700; }
.so-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:11px 12px; padding:13px 14px 14px; }
.so-grid.g2 { grid-template-columns:repeat(2, 1fr); }
.so-f { display:flex; flex-direction:column; gap:4px; min-width:0; }
.so-f.w2 { grid-column:span 2; } .so-f.w3 { grid-column:span 3; } .so-f.wall { grid-column:1 / -1; }
.so-f label { font-size:11.5px; font-weight:600; color:#344054; }
.so-f label i { color:#D92D20; font-style:normal; }
.so input, .so select, .so textarea { height:32px; padding:0 9px; border:1px solid #C9D7DA; border-radius:6px; background:#fff; outline:none;
  font:400 12.5px ${F}; color:#101828; width:100%; box-sizing:border-box; transition:border-color .15s, box-shadow .15s; }
.so textarea { height:auto; min-height:52px; padding:7px 9px; resize:vertical; line-height:1.45; }
.so input::placeholder, .so textarea::placeholder { color:#A0AEB3; }
.so input:hover, .so select:hover, .so textarea:hover { border-color:#9DBDC1; }
.so input:focus, .so select:focus, .so textarea:focus { border-color:${TEAL}; box-shadow:0 0 0 3px rgba(3,68,79,.12); }
.so input[readonly] { background:#F2F6F6; color:#475467; }
.so .mono { font-family:ui-monospace, Consolas, monospace; letter-spacing:.3px; }
.so .num { text-align:right; }
.so .bad { border-color:#D92D20 !important; background:#FFFBFA; }
.so-err { font-size:10.5px; color:#D92D20; }
.so-hint { font-size:10.5px; color:#98A2B3; }

/* client picker */
.so-pick { position:relative; }
.so-pick .list { position:absolute; left:0; right:0; top:36px; z-index:40; max-height:280px; overflow-y:auto; padding:4px; border-radius:8px; background:#fff;
  border:1px solid #D0D5DD; box-shadow:0 12px 30px rgba(16,24,40,.16); }
.so-pick .opt { display:flex; align-items:center; gap:10px; width:100%; padding:7px 9px; border:none; border-radius:6px; background:none; cursor:pointer; text-align:left; font:inherit; }
.so-pick .opt:hover, .so-pick .opt.sel { background:#F0F7F7; }
.so-pick .opt .av { width:26px; height:26px; border-radius:6px; display:grid; place-items:center; background:${TEAL}; color:#fff; font-size:10px; font-weight:700; flex-shrink:0; }
.so-pick .opt b { display:block; font-size:12.5px; color:#101828; font-weight:600; }
.so-pick .opt small { display:block; font-size:11px; color:#667085; }
.so-pick .none { padding:10px; font-size:12px; color:#667085; }
.so-cli { display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:8px; background:#F0F7F7; border:1px solid #D7E3E5; }
.so-cli .av { width:34px; height:34px; border-radius:8px; display:grid; place-items:center; background:${TEAL}; color:#fff; font-size:12px; font-weight:700; flex-shrink:0; }
.so-cli b { display:block; font-size:13.5px; color:#101828; }
.so-cli small { display:block; font-size:11.5px; color:#475467; }
.so-cli .grow { flex:1; min-width:0; }
.so-link { border:none; background:none; color:${TEAL}; font:600 12px ${F}; cursor:pointer; padding:4px 6px; border-radius:5px; }
.so-link:hover { background:#E1EFF0; }
.so-same { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:#344054; cursor:pointer; font-weight:500; }
.so-same input { width:15px; height:15px; margin:0; accent-color:${TEAL}; }

/* line tables */
.so-tw { overflow-x:auto; }
.so-t { width:100%; border-collapse:collapse; min-width:900px; }
.so-adbox > td { padding:0 6px 8px !important; border-bottom:1px solid #E4E7EC !important; }
.so-hasad > td { border-bottom:0 !important; }
.so-adt { min-width:0 !important; margin:0 0 4px; border:1px solid #E4EEEF; border-radius:6px; background:#FAFCFC; }
.so-adt td { padding:5px 6px !important; border-bottom:1px solid #EEF3F3 !important; }
.so-adt td.sn { color:#03444F !important; font-weight:700; padding-top:12px !important; }
.so-adbar { display:flex; flex-wrap:wrap; align-items:center; gap:6px; font-size:11.5px; color:#667085; }
.so-adbar button { height:24px; padding:0 9px; border:1px dashed #9DB9BD; border-radius:5px; background:#fff; color:#03444F; font-family:inherit; font-size:11.5px; font-weight:600; cursor:pointer; }
.so-adbar button:hover:not(:disabled) { border-style:solid; background:#F0F7F7; }
.so-adbar button.add { border-style:solid; border-color:#03444F; }
.so-aic { display:block; margin-top:3px; font-size:10.5px; color:#667085; }
.so-mut { display:block; padding-top:8px; text-align:center; color:#98A2B3; }
.so-atot { height:34px; display:flex; align-items:center; justify-content:flex-end; padding:0 9px; border-radius:6px; background:#F0F7F7; font-weight:700; color:#03444F; }
.so-t th { text-align:left; font-size:11px; font-weight:700; color:#475467; text-transform:uppercase; letter-spacing:.3px; padding:8px 6px 6px; background:#F7FAFA; border-bottom:1px solid #EDF2F3; white-space:nowrap; }
.so-t th.r { text-align:right; }
.so-t td { padding:6px; vertical-align:top; border-bottom:1px solid #F2F5F5; }
.so-t td.sn { width:34px; padding-left:14px; padding-top:13px; font-size:12px; color:#667085; }
.so-t td.val { padding-top:13px; font-size:12.5px; text-align:right; white-space:nowrap; color:#101828; font-variant-numeric:tabular-nums; }
.so-t td.val b { font-weight:600; }
.so-t td.x, .so-t th.x { width:44px; text-align:center; padding-right:10px; }
.so-t tbody tr:hover td { background:#FAFCFC; }
.so-rm { width:30px; height:30px; border:1px solid transparent; border-radius:6px; background:none; cursor:pointer; color:#98A2B3; font-size:17px; line-height:1; }
.so-rm:hover { background:#FDECEC; border-color:#F5C2C0; color:#D92D20; }
.so-add { display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 13px; border:1px solid ${TEAL}; border-radius:6px; background:#fff; color:${TEAL}; cursor:pointer; font:600 12px ${F}; }
.so-add:hover { background:${TEAL}; color:#fff; }
.so-empty { padding:16px 14px; font-size:12.5px; color:#98A2B3; text-align:center; }
.so-aq { display:flex; flex-wrap:wrap; align-items:center; gap:6px; padding:8px 14px; border-bottom:1px solid #EDF2F3; font-size:12px; color:#667085; }
.so-aq button { height:26px; padding:0 12px; border:1px dashed #9DBDC1; border-radius:2px; background:#fff; color:${TEAL}; cursor:pointer; font:600 12px ${F}; }
.so-aq button:hover:not(:disabled) { border-style:solid; border-color:${TEAL}; background:#F0F7F7; }
.so-inp { display:inline-flex; align-items:center; gap:5px; font-size:12px; color:#344054; cursor:pointer; }
.so-inp input { width:15px; height:15px; accent-color:${TEAL}; }
.so-t td.c { text-align:center; }
.so-sub { display:flex; justify-content:flex-end; gap:18px; padding:9px 14px; background:#F7FAFA; border-top:1px solid #EDF2F3; font-size:12px; color:#475467; }
.so-sub b { color:#101828; font-variant-numeric:tabular-nums; }

/* summary */
.so-sum { display:grid; grid-template-columns:1fr 360px; gap:14px; margin-bottom:14px; }
.so-tot { background:#fff; border:1px solid #D7E3E5; border-radius:10px; padding:12px 16px; box-shadow:0 1px 3px rgba(16,24,40,.05); }
.so-tot .row { display:flex; justify-content:space-between; padding:4px 0; font-size:12.5px; color:#475467; font-variant-numeric:tabular-nums; }
.so-tot .row b { color:#101828; font-weight:600; }
.so-tot .gt { margin-top:6px; padding-top:9px; border-top:1px dashed #C9D7DA; font-size:15px; color:${TEAL}; }
.so-tot .gt b { color:${TEAL}; font-weight:700; }
.so-tot .tax { font-size:11px; color:#98A2B3; text-align:right; margin-top:2px; }

/* specs + files */
.so-spec { display:grid; grid-template-columns:240px 1fr; border-bottom:1px solid #F2F5F5; }
.so-spec:last-child { border-bottom:none; }
.so-spec .nm { padding:12px 14px; border-right:1px solid #F2F5F5; background:#FAFCFC; }
.so-spec .nm b { display:block; font-size:12.5px; color:#101828; }
.so-spec .nm small { display:block; font-size:11px; color:#667085; margin-top:2px; }
.so-spec .bd { padding:10px 14px; display:flex; flex-direction:column; gap:8px; }
.so-files { display:flex; flex-wrap:wrap; gap:6px; }
.so-file { display:inline-flex; align-items:center; gap:7px; max-width:280px; padding:4px 4px 4px 6px; border:1px solid #E3ECED; border-radius:6px; background:#fff; font-size:11.5px; color:#344054; }
.so-file .ext { padding:2px 5px; border-radius:4px; background:${TEAL}; color:#fff; font-size:9px; font-weight:700; text-transform:uppercase; }
.so-file span.nm2 { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.so-file button { width:20px; height:20px; border:none; border-radius:4px; background:none; cursor:pointer; color:#98A2B3; font-size:14px; line-height:1; }
.so-file button:hover { background:#FDECEC; color:#D92D20; }
.so-up { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 11px; border:1px dashed #9DBDC1; border-radius:6px; background:#F7FBFB; color:${TEAL}; cursor:pointer; font:600 11.5px ${F}; }
.so-up:hover { border-color:${TEAL}; background:#E8F3F4; }
.so-drop { margin:14px; padding:20px 14px; border:1.5px dashed #9DBDC1; border-radius:10px; background:#F7FBFB; text-align:center; cursor:pointer; }
.so-drop:hover, .so-drop.over { background:#E8F3F4; border-color:${TEAL}; }
.so-drop .ic { width:40px; height:40px; margin:0 auto 7px; border-radius:50%; display:grid; place-items:center; background:#fff; border:1px solid #D7E3E5; color:${TEAL}; }
.so-drop b { display:block; font-size:13px; color:#101828; }
.so-drop b u { color:${TEAL}; }
.so-drop small { display:block; margin-top:3px; font-size:11.5px; color:#667085; }
.so-att { display:grid; grid-template-columns:36px 1fr 1fr 32px; gap:10px; align-items:center; padding:7px 8px; margin:0 14px 6px; border:1px solid #E3ECED; border-radius:8px; }
.so-att .ext { width:36px; height:36px; border-radius:6px; display:grid; place-items:center; background:${TEAL}; color:#fff; font-size:9.5px; font-weight:700; text-transform:uppercase; }
.so-att .fn { min-width:0; } .so-att .fn b { display:block; font-size:12.5px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; } .so-att .fn small { font-size:11px; color:#667085; }

/* bottom bar */
.so-bar { position:sticky; bottom:0; display:flex; align-items:center; gap:8px; padding:10px 16px; background:rgba(255,255,255,.97); border-top:1px solid #D7E3E5; box-shadow:0 -4px 14px rgba(16,24,40,.06); }
.so-bar .info { flex:1; min-width:0; font-size:12px; color:#667085; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.so-bar .info b { color:${TEAL}; font-size:13.5px; }
.so-b { height:36px; padding:0 18px; border-radius:6px; cursor:pointer; font:600 13px ${F}; border:1px solid transparent; white-space:nowrap; }
.so-b.ghost { background:#fff; border-color:#C9D7DA; color:#344054; }
.so-b.draft { background:#fff; border-color:${TEAL}; color:${TEAL}; }
.so-b.pri { background:${TEAL}; color:#fff; box-shadow:0 2px 6px rgba(3,68,79,.35); }
.so-b.pri:hover { background:#025763; }
.so-b:disabled { opacity:.6; cursor:default; }
.so-msg { margin:0 0 14px; padding:10px 14px; border-radius:8px; font-size:12.5px; font-weight:500; }
.so-msg.ok { background:#E6F4EA; color:#1E7B34; border:1px solid #B7E1C1; }
.so-msg.err { background:#FDECEC; color:#B42318; border:1px solid #F5C2C0; }

/* ── square boxes + highlighted section headers (e-Way Bill style) ── */
.so-hero, .so-card, .so-tot, .so-msg, .so-drop, .so-att, .so-file, .so-cli { border-radius:0 !important; }
.so input, .so select, .so textarea, .so-b, .so-add, .so-up, .so-rm, .so-att .ext, .so-file .ext { border-radius:2px; }
.so-card { border-color:#B9CED1; box-shadow:none; }
.so-ch { padding:8px 12px; background:linear-gradient(90deg, ${TEAL} 0%, #0A6E7A 100%); border-bottom:none; }
.so-ch .ico { width:24px; height:24px; border-radius:2px; background:rgba(255,255,255,.16); color:#fff; }
.so-ch .t b { color:#fff; font-size:13px; letter-spacing:.2px; }
.so-ch .t small { color:rgba(255,255,255,.75); }
.so-ch .cnt { background:rgba(255,255,255,.2); color:#fff; border-radius:2px; }
.so-ch .so-add { background:#fff; border-color:#fff; color:${TEAL}; height:26px; }
.so-ch .so-add:hover { background:#E1EFF0; color:${TEAL}; }
.so-ch .so-same { color:#fff; }
.so-ch .so-same input { accent-color:#fff; }
.so-tot { border-color:#B9CED1; box-shadow:none; }

/* Amount | % of Taxable switch + % input */
.so-seg { display:flex; height:32px; border:1px solid #C9D7DA; border-radius:2px; overflow:hidden; }
.so-seg button { flex:1; border:0; background:#fff; cursor:pointer; font:600 11.5px ${F}; color:#475467; white-space:nowrap; padding:0 6px; }
.so-seg button + button { border-left:1px solid #C9D7DA; }
.so-seg button.on { background:${TEAL}; color:#fff; }
.so-pct { display:flex; }
.so-pct input { border-radius:2px 0 0 2px; }
.so-pct span { width:28px; flex-shrink:0; display:grid; place-items:center; border:1px solid #C9D7DA; border-left:0; background:#F4F8F8; font-size:12px; font-weight:600; color:#475467; }

/* v3 — lighter teal, paired cards touch, compact headers */
.so-in { padding:0 0 14px; }
.so-hero { padding:8px 14px; margin-bottom:0; border-left:none; border-right:none; gap:10px; background:linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%); box-shadow:none; }
.so-hero::after { display:none; }
.so-hero .ic { width:28px; height:28px; border-radius:2px; }
.so-hero h1 { font-size:15px; }
.so-chip { flex-direction:row; align-items:center; gap:8px; padding:3px 10px; border-radius:2px; }
.so-chip b { font-size:13.5px; }
.so-ch { padding:6px 10px; background:linear-gradient(90deg, #1B7682 0%, #3C9AA4 100%); }
.so-ch .ico { width:22px; height:22px; }
.so-ch .t { display:flex; align-items:baseline; gap:10px; }
.so-ch .t small { margin-top:0; }
.so-ch .so-add { height:24px; }
.so-2 { gap:0; margin-bottom:10px; }
.so-2 > .so-card + .so-card { border-left:none; }
.so-card { margin-bottom:10px; border-left:none; border-right:none; }
.so-2 > .so-card + .so-card { border-left:1px solid #B9CED1; }
.so-msg { margin:8px 10px; }
.so-sum { margin-bottom:10px; }
.so-kv th.sm { width:64px; }
/* item / charge table headers: black text on a highlighted band */
.so-t th { background:#D4EBEE; color:#000; font-size:11.5px; font-weight:700; border-bottom:1px solid #A9CDD2; padding:7px 6px; }

/* label | value rows */
.so-kv { width:100%; border-collapse:collapse; table-layout:fixed; }
.so-kv th { width:118px; padding:7px 10px; background:#F4F8F8; border:1px solid #DCE6E8; text-align:left; vertical-align:middle;
  font-size:12px; font-weight:600; color:#344054; white-space:nowrap; }
.so-kv th i { color:#D92D20; font-style:normal; }
.so-kv td { padding:5px 7px; border:1px solid #DCE6E8; vertical-align:middle; }
.so-kv tr:first-child th, .so-kv tr:first-child td { border-top:none; }
.so-kv tr > :first-child { border-left:none; } .so-kv tr > :last-child { border-right:none; }
.so-kv tr:last-child th, .so-kv tr:last-child td { border-bottom:none; }
.so-kv input, .so-kv select, .so-kv textarea { height:30px; }
.so-kv textarea { height:auto; min-height:46px; }
.so-kv input[readonly], .so-kv textarea.ro, .so-kv select:disabled { background:#F2F6F6; color:#475467; }

/* field + search button */
.so-srch { display:flex; }
.so-src { display:flex; align-items:center; margin-top:5px; }
.so-src button { height:22px; padding:0 12px; border:1px solid #D0D5DD; background:#fff; color:#667085; font:inherit; font-size:11.5px; font-weight:600; cursor:pointer; }
.so-src button:first-child { border-radius:2px 0 0 2px; } .so-src button:nth-child(2) { border-left:none; border-radius:0 2px 2px 0; }
.so-src button.on { background:${TEAL}; border-color:${TEAL}; color:#fff; }
.so-src button.on.mk { background:#B54708; border-color:#B54708; }
.so-src button:disabled { cursor:default; opacity:.6; }
.so-src span { margin-left:8px; font-size:11px; color:#667085; }
.so-srch input { flex:1; min-width:0; border-radius:2px 0 0 2px; cursor:default; }
.so-srch input:not([readonly]) { cursor:text; }
.so-sbtn { width:34px; flex-shrink:0; border:1px solid ${TEAL}; border-left:none; border-radius:0 2px 2px 0; background:${TEAL}; color:#fff; cursor:pointer; display:grid; place-items:center; }
.so-sbtn:hover { background:#025763; }
.so-sbtn:disabled { opacity:.6; cursor:default; }
.so-kv .so-srch input, .so-kv .so-sbtn { height:30px; }

/* search pop-up */
.so-pkb { position:fixed; inset:0; z-index:1600; background:rgba(2,24,28,.45); display:flex; align-items:flex-start; justify-content:center; padding:8vh 16px; font-family:${F}; }
.so-pk { width:100%; max-width:860px; max-height:78vh; display:flex; flex-direction:column; background:#fff; border:1px solid #9DBDC1; box-shadow:0 20px 60px rgba(0,0,0,.35); }
.so-pkh { display:flex; align-items:center; gap:10px; padding:9px 12px; background:linear-gradient(90deg, ${TEAL} 0%, #0A6E7A 100%); color:#fff; }
.so-pkh b { font-size:13.5px; } .so-pkh small { font-size:11.5px; opacity:.8; } .so-pkh .grow { flex:1; }
.so-pkh button { width:26px; height:26px; border:1px solid rgba(255,255,255,.35); background:rgba(255,255,255,.1); color:#fff; cursor:pointer; font-size:16px; line-height:1; }
.so-pks { display:flex; align-items:center; gap:8px; padding:9px 12px; border-bottom:1px solid #DCE6E8; color:#98A2B3; }
.so-pks input { flex:1; height:32px; padding:0 10px; border:1px solid #C9D7DA; border-radius:2px; outline:none; font:400 13px ${F}; }
.so-pks input:focus { border-color:${TEAL}; box-shadow:0 0 0 3px rgba(3,68,79,.12); }
.so-pkl { overflow-y:auto; }
.so-pkl table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:12.5px; }
.so-pkl th { position:sticky; top:0; background:#F4F8F8; color:#344054; font-weight:600; text-align:left; padding:7px 10px; border-bottom:1px solid #DCE6E8; }
.so-pkl td { padding:7px 10px; border-bottom:1px solid #F0F4F4; color:#101828; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; }
.so-pkl tr.sel td { background:#E1EFF0; }
.so-susp { display:inline-block; padding:2px 7px; border-radius:2px; background:#FDECEC; color:#B42318; font-size:11px; font-weight:700; }
.so-copy { position:relative; z-index:1; height:28px; padding:0 12px; display:inline-flex; align-items:center; gap:6px; border:1px solid rgba(255,255,255,.45); border-radius:2px;
  background:rgba(255,255,255,.12); color:#fff; cursor:pointer; font:600 12px 'Inter', sans-serif; white-space:nowrap; }
.so-copy:hover { background:#fff; color:#03444f; }
.so-cp { max-width:560px; }
.so-cpb { padding:12px 14px 4px; display:flex; flex-direction:column; gap:6px; }
.so-cpi { display:flex; align-items:center; gap:10px; padding:9px 11px; border:1px solid #DCE6E8; cursor:pointer; font-size:13px; color:#344054; }
.so-cpi:hover { border-color:#03444f; } .so-cpi.on { background:#F0F7F7; border-color:#9DBDC1; color:#03444f; font-weight:600; }
.so-cpi input { width:15px; height:15px; margin:0; accent-color:#03444f; cursor:pointer; }
.so-cpi span { flex:1; } .so-cpi small { font-size:11.5px; color:#667085; font-weight:500; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.so-cpn { margin:6px 0 4px; font-size:11.5px; color:#667085; line-height:1.5; }
.so-cpf { display:flex; justify-content:flex-end; gap:8px; padding:10px 14px; border-top:1px solid #DCE6E8; background:#F7FAFA; }
.so-pkl td.none { text-align:center; color:#98A2B3; cursor:default; padding:22px; }

@media (max-width: 1100px) { .so-2, .so-sum { grid-template-columns:1fr; } .so-grid { grid-template-columns:repeat(2, 1fr); } }
@media (max-width: 700px) { .so-grid, .so-grid.g2 { grid-template-columns:1fr; } .so-f.w2, .so-f.w3 { grid-column:auto; } .so-spec { grid-template-columns:1fr; } }
`;

/* Search pop-up (like the classic SO form): type to filter, click a row or ↑ ↓ Enter to choose */
function Picker({ title, placeholder, cols, rows, keyOf, textOf, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inRef = useRef(null), listRef = useRef(null);
  useEffect(() => { inRef.current?.focus(); }, []);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(r => !w.length || w.every(x => textOf(r).toLowerCase().includes(x))).slice(0, 200);
  }, [rows, q, textOf]);
  useEffect(() => setSel(0), [q]);
  useEffect(() => { listRef.current?.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const key = e => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter' && list[sel]) { e.preventDefault(); onPick(list[sel]); }
  };
  return (
    <div className="so-pkb" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="so-pk" role="dialog" aria-modal="true" aria-label={title} onKeyDown={key}>
        <div className="so-pkh"><b>{title}</b><span className="grow" /><small>{list.length} found</small><button type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="so-pks"><Svg name="search" size={15} /><input ref={inRef} value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label="Search" /></div>
        <div className="so-pkl" ref={listRef}>
          <table>
            <thead><tr>{cols.map(c => <th key={c[0]} style={{ width: c[2] }}>{c[0]}</th>)}</tr></thead>
            <tbody>
              {list.length ? list.map((r, i) => (
                <tr key={keyOf(r)} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => onPick(r)}>
                  {cols.map(c => <td key={c[0]}>{c[1](r) || '—'}</td>)}
                </tr>
              )) : <tr><td colSpan={cols.length} className="none">Nothing matches “{q}”.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const initials = s => String(s || '').replace(/^M\/s\.?\s*/i, '').split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'C';

/* saved order → form values (edit mode) */
const parseSpec = raw => { try { const p = JSON.parse(raw || ''); return p && typeof p === 'object' ? p : {}; } catch { return {}; } };
const fromOrder = o => {
  const items = (o.items || []).map(it => ({ ...newItem(), ...it, _id: it._id || uid(), description: it.description || it.material || it.itemName || '',
    rate: it.rate === 0 || it.rate ? String(it.rate) : '', qty: it.qty === 0 || it.qty ? String(it.qty) : '1', gst: n(it.gstPercent ?? it.gst), dueDate: it.dueDate || '' }));
  const charges = (o.charges || []).filter(c => !c.withoutGst).map(c => ({ ...newCharge(), ...c, _id: uid(), mode: c.mode === 'pct' ? 'pct' : 'amount',
    pct: c.pct === 0 || c.pct ? String(c.pct) : '', amount: c.amount === 0 || c.amount ? String(c.amount) : '', gst: n(c.gst) }));
  const plain = (o.charges || []).filter(c => c.withoutGst).map(c => ({ _id: uid(), description: c.description || '', amount: String(c.amount ?? '') }));
  const notes = {};
  (parseSpec(o.specSheet).itemNotes || []).forEach(x => { if (x && x.itemId) notes[x.itemId] = x.text || ''; });
  const v = {
    ...EMPTY,
    orderNo: o.orderNo || '', orderDate: o.orderDate || today(), quotationRef: o.quotationRef || '', quotationDate: o.quotationDate || '',
    customerPO: o.customerPO || '', poDate: o.poDate || '', paymentTerms: o.paymentTerms || '',
    clientId: String(o.customerCode || ''), customerName: o.customerName || o.party || '', contactPerson: o.contactPerson || '', mobile: o.mobile || '', email: o.email || '',
    billName: o.customerName || o.party || '', billAddress: o.address || '', billCity: o.customerCity || '', billState: o.customerState || '',
    billPincode: String(o.customerPincode || ''), billGstin: o.customerGstin || '', billContact: o.billToContact || '', billMobile: o.billToMobile || '',
    shipName: o.shipToName || '', shipAddress: o.shipToAddress || o.deliveryAddr || '', shipCity: o.shipToCity || '', shipState: o.shipToState || '',
    shipPincode: String(o.shipToPincode || ''), shipGstin: o.shipToGstin || '', shipContact: o.shipToContact || '', shipMobile: o.shipToMobile || '',
  };
  const same = ['Name', 'Address', 'City', 'State', 'Pincode', 'Gstin'].every(k => String(v['ship' + k] || '') === String(v['bill' + k] || ''));
  const addons = (Array.isArray(o.addons) ? o.addons : []).filter(Boolean).map(a => ({ ...newAddon(), ...a, _id: uid(), qty: a.qty === 0 || a.qty ? String(a.qty) : '1', includedInPrice: a.includedInPrice !== false,
    forItem: a.forItemId ? String(a.forItemId) : '', perUnit: a.perUnit === 0 || a.perUnit ? String(a.perUnit) : '1', itemCode: a.itemCode ? String(a.itemCode) : '' }));
  return {
    v, items: items.length ? items : [newItem()], charges, plain, notes, same, addons,
    specFiles: (o.specFiles || []).filter(Boolean).map(x => ({ ...x, name: x.name || x.fileName || 'Specification', _id: uid(), saved: true })),
    atts: (o.attachments || []).filter(Boolean).map(x => ({ ...x, name: x.name || x.fileName || 'Attachment', _id: uid(), saved: true })),
  };
};
const fileNameOf = x => (x.file ? x.file.name : (x.originalName || x.fileName || x.name || 'file'));

export default function BetaCreateSO({ companyId, company, orders = [], onSaved, editOrder, onClose, presetNo }) {
  const isEdit = !!editOrder;
  const init = useMemo(() => (editOrder ? fromOrder(editOrder) : null), [editOrder]);
  const [v, setV] = useState(init ? init.v : presetNo ? { ...EMPTY, orderNo: presetNo } : EMPTY);   // presetNo: a missing number picked in the order list
  const [items, setItems] = useState(init ? init.items : [newItem()]);
  const [charges, setCharges] = useState(init ? init.charges : []);   // additional charges with GST
  const [plain, setPlain] = useState(init ? init.plain : []);         // charges without GST
  const [addons, setAddons] = useState(init ? init.addons : []);      // add-on items (optional, included in price)
  const setAddon = (i, k, val) => setAddons(xs => xs.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  /* add-on of a product: qty per piece × that product's qty; otherwise the qty typed (for the whole order) */
  const addonFor = a => (a.forItem ? items.find(it => it._id === a.forItem) : null);
  const addonQty = a => { const p = addonFor(a); return p ? Math.round(n(a.perUnit) * n(p.qty) * 1000) / 1000 : n(a.qty); };
  const pickAddonItem = (i, text) => setAddons(xs => xs.map((x, j) => {
    if (j !== i) return x;
    const m = master.find(y => (y.itemName || '').toLowerCase() === text.trim().toLowerCase());
    return { ...x, description: text, itemCode: m ? String(m.itemCode || '') : '', unit: m ? (m.uom && m.uom !== 'N/A' ? m.uom : x.unit) : x.unit };
  }));
  /* one add-on row: under its product (no product column), or in the whole-order card */
  const addonRow = (a, i, under) => (
    <tr key={a._id} className={under ? 'so-adr' : ''}>
      <td className="sn">{under ? '↳' : i + 1}</td>
      {!under && <td><select value={addonFor(a) ? a.forItem : ''} onChange={e => setAddon(i, 'forItem', e.target.value)} disabled={busy} aria-label="Product of this add-on">
        <option value="">Whole order</option>
        {items.filter(it => it.description.trim()).map((it, k) => <option key={it._id} value={it._id}>{k + 1}. {it.description} ({num(n(it.qty))} {it.unit})</option>)}
      </select></td>}
      <td><input list="so-items" value={a.description} onChange={e => pickAddonItem(i, e.target.value)} disabled={busy} placeholder="Search or type item (AC, TV…)" aria-label="Add-on item" />
        {a.description.trim() && <small className="so-aic">{a.itemCode ? `Item #${a.itemCode}` : 'New — added to Stock Items on save'}</small>}</td>
      <td style={{ width: 140 }}><select value={a.category} onChange={e => setAddon(i, 'category', e.target.value)} disabled={busy} aria-label="Category">{[...new Set([...ADDON_CATS, a.category || 'Accessory'])].map(c => <option key={c} value={c}>{c}</option>)}</select></td>
      <td><input value={a.remarks || ''} onChange={e => setAddon(i, 'remarks', e.target.value)} disabled={busy} placeholder="Make, model, size… (optional)" aria-label="Specification" /></td>
      <td style={{ width: 72 }}>{addonFor(a)
        ? <input value={a.perUnit} onChange={e => setAddon(i, 'perUnit', e.target.value.replace(/[^\d.]/g, ''))} disabled={busy} inputMode="decimal" className="num" aria-label="Qty per piece" />
        : <span className="so-mut">—</span>}</td>
      <td style={{ width: 80 }}>{addonFor(a)
        ? <div className="so-atot" title={`${num(n(a.perUnit))} × ${num(n(addonFor(a).qty))}`}>{num(addonQty(a))}</div>
        : <input value={a.qty} onChange={e => setAddon(i, 'qty', e.target.value.replace(/[^\d.]/g, ''))} disabled={busy} inputMode="decimal" className="num" aria-label="Qty" />}</td>
      <td style={{ width: 84 }}><select value={a.unit} onChange={e => setAddon(i, 'unit', e.target.value)} disabled={busy} aria-label="Unit">{[...new Set([...UNITS, a.unit || 'NOS'])].map(u => <option key={u} value={u}>{u}</option>)}</select></td>
      <td style={{ width: 70 }} className="c"><label className="so-inp"><input type="checkbox" checked={!!a.includedInPrice} onChange={e => setAddon(i, 'includedInPrice', e.target.checked)} disabled={busy} />In price</label></td>
      <td className="x"><button type="button" className="so-rm" title="Remove add-on" aria-label="Remove add-on" onClick={() => setAddons(xs => xs.filter((_, j) => j !== i))}>×</button></td>
    </tr>
  );
  const [notes, setNotes] = useState(init ? init.notes : {});         // { itemId: spec text }
  const [specFiles, setSpecFiles] = useState(init ? init.specFiles : []);   // new: { file } · saved: { fileName, filePath, saved }
  const [atts, setAtts] = useState(init ? init.atts : []);
  const [sameShip, setSameShip] = useState(init ? init.same : true);
  const [clients, setClients] = useState([]);
  const [master, setMaster] = useState([]);             // item master
  const [nextId, setNextId] = useState('');
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [over, setOver] = useState(false);
  const attRef = useRef(null), topRef = useRef(null);

  const loadNext = () => axios.get('/api/sales-orders/next-id', { params: { companyId } }).then(r => setNextId(r.data?.nextId || '')).catch(() => setNextId(''));
  useEffect(() => {
    if (!companyId) return;
    if (!isEdit) loadNext();
    // suspended clients stay in the search (marked) but cannot be chosen — see chooseClient
    axios.get('/api/clients', { params: { companyId } }).then(r => setClients((Array.isArray(r.data) ? r.data : []).filter(c => c.status !== 'rejected'))).catch(() => setClients([]));
    axios.get('/api/items', { params: { companyId } }).then(r => setMaster(Array.isArray(r.data) ? r.data : [])).catch(() => setMaster([]));
  }, [companyId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const [picker, setPicker] = useState(null);   // { kind:'client' } | { kind:'item', row } | { kind:'copy' }

  /* Copy from order: take client, products (qty / rate / GST / HSN), charges, item specs and payment terms from an
     existing order. Order no., dates, client PO, quotation and attachments are never copied; item due dates are cleared. */
  const [copyFrom, setCopyFrom] = useState(null);   // order chosen, waiting for what to copy
  const [copyWhat, setCopyWhat] = useState({ client: true, items: true, charges: true, specs: true, terms: true });
  const CLIENT_KEYS = ['clientId', 'customerName', 'contactPerson', 'mobile', 'email',
    'billName', 'billAddress', 'billCity', 'billState', 'billPincode', 'billGstin', 'billContact', 'billMobile',
    'shipName', 'shipAddress', 'shipCity', 'shipState', 'shipPincode', 'shipGstin', 'shipContact', 'shipMobile'];
  const applyCopy = () => {
    const src = copyFrom, f = fromOrder(src), w = copyWhat, done = [];
    let note = '';
    if (w.client) {
      const c = clients.find(x => String(x.clientId) === String(f.v.clientId));
      if (c && c.status === 'suspended') note = ` Client not copied — ${c.companyName || c.clientName} is suspended.`;
      else { setV(o => { const nv = { ...o }; CLIENT_KEYS.forEach(k => { nv[k] = f.v[k]; }); return nv; }); setSameShip(f.same); done.push('client'); }
    }
    if (w.items) {
      const idMap = {};
      setItems(f.items.map(it => { const id = uid(); idMap[it._id] = id; return { ...it, _id: id, dueDate: '' }; }));
      done.push(`${f.items.filter(it => it.description).length} product${f.items.length === 1 ? '' : 's'}`);
      if (w.specs) {
        const nn = {}; Object.entries(f.notes).forEach(([k, t]) => { if (idMap[k]) nn[idMap[k]] = t; });
        setNotes(nn); if (Object.keys(nn).length) done.push('specs');
      }
    }
    if (w.charges) { setCharges(f.charges); setPlain(f.plain); if (f.charges.length || f.plain.length) done.push('charges'); }
    if (w.terms && f.v.paymentTerms) { setV(o => ({ ...o, paymentTerms: f.v.paymentTerms })); done.push('payment terms'); }
    setCopyFrom(null); setErrs({});
    setMsg({ ok: !note, text: `Copied ${done.join(', ') || 'nothing'} from ${src.orderNo || src.orderId}. Check qty, rate and due dates before saving.${note}` });
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const set = k => e => {
    let val = e.target.value;
    if (k === 'billGstin' || k === 'shipGstin') val = val.toUpperCase().replace(/\s/g, '').slice(0, 15);
    if (k === 'billPincode' || k === 'shipPincode') val = val.replace(/\D/g, '').slice(0, 6);
    if (k === 'mobile' || k === 'shipMobile' || k === 'billMobile') val = val.replace(/[^\d+ ]/g, '').slice(0, 15);
    setV(o => ({ ...o, [k]: val }));
    setErrs(o => ({ ...o, [k]: undefined })); setMsg(null);
  };

  /* client chosen in the search pop-up */
  const chooseClient = c => {
    if (c.status === 'suspended') {
      setPicker(null);
      setErrs(o => ({ ...o, customerName: `${c.companyName || c.clientName} is suspended — please activate the client first.` }));
      setMsg({ ok: false, text: `Client ${c.companyName || c.clientName} (${c.clientId}) is suspended. Please activate the client (Client → double-click → Activate) before creating a sales order.` });
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const cp = (c.contactPersons || []).find(p => p && (p.name || p.mobileNumber)) || {};
    const name = c.companyName || c.clientName || '';
    setV(o => ({
      ...o, clientId: String(c.clientId || ''), customerName: name,
      contactPerson: cp.name || c.contactPerson || '', mobile: cp.mobileNumber || c.mobile || '', email: cp.email || c.email || '',
      billName: c.mailingName || name, billAddress: c.address || c.billingAddr || '', billCity: c.city || '', billState: c.state || '',
      billPincode: String(c.pincode || ''), billGstin: c.gstin || c.gst || '',
      billContact: cp.name || c.contactPerson || '', billMobile: cp.mobileNumber || c.mobile || '',
    }));
    setPicker(null);
    setErrs(o => ({ ...o, customerName: undefined })); setMsg(null);
  };
  /* product chosen in the item search pop-up → fills that line */
  const chooseItem = (i, m) => {
    setItems(xs => xs.map((x, j) => (j === i ? {
      ...x, description: m.itemName || '', itemCode: String(m.itemCode || ''), hsnCode: m.hsnCode || '',
      unit: m.unit || m.uom || x.unit, gst: m.gst != null && m.gst !== '' ? n(m.gst) : (m.gstRate != null ? n(m.gstRate) : x.gst),
      rate: m.saleRate || m.rate || x.rate,
    } : x)));
    setPicker(null);
    setErrs(o => ({ ...o, [`i${i}`]: undefined, items: undefined })); setMsg(null);
  };

  /* ship-to follows bill-to while "same" is ticked */
  const ship = sameShip
    ? { shipName: v.billName, shipAddress: v.billAddress, shipCity: v.billCity, shipState: v.billState, shipPincode: v.billPincode, shipGstin: v.billGstin, shipContact: v.billContact, shipMobile: v.billMobile }
    : v;

  /* lines */
  const setItem = (i, k, val) => setItems(xs => xs.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  const pickMaster = (i, text) => {
    setItem(i, 'description', text);
    const m = master.find(x => (x.itemName || '').toLowerCase() === text.trim().toLowerCase());
    if (m) setItems(xs => xs.map((x, j) => (j === i ? {
      ...x, description: m.itemName, itemCode: String(m.itemCode || ''), hsnCode: m.hsnCode || x.hsnCode,
      unit: m.unit || m.uom || x.unit, gst: m.gst != null && m.gst !== '' ? n(m.gst) : (m.gstRate != null ? n(m.gstRate) : x.gst),
      rate: x.rate === '' || x.rate == null ? (m.saleRate || m.rate || '') : x.rate,
    } : x)));
    setErrs(o => ({ ...o, [`i${i}`]: undefined, items: undefined }));
  };
  const setCharge = (i, k, val) => setCharges(xs => xs.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  const setPl = (i, k, val) => setPlain(xs => xs.map((x, j) => (j === i ? { ...x, [k]: val } : x)));

  /* totals */
  const t = useMemo(() => {
    const iNet = items.reduce((s, it) => s + n(it.qty) * n(it.rate), 0);
    const iGst = items.reduce((s, it) => s + n(it.qty) * n(it.rate) * n(it.gst) / 100, 0);
    const cNet = charges.reduce((s, c) => s + chargeAmt(c, iNet), 0);
    const cGst = charges.reduce((s, c) => s + chargeAmt(c, iNet) * n(c.gst) / 100, 0);
    const pNet = plain.reduce((s, c) => s + n(c.amount), 0);
    const gst = iGst + cGst;
    const coState = String(company?.state || '').trim().toLowerCase();
    const custState = String(v.billState || '').trim().toLowerCase();
    const intra = !coState || !custState || coState === custState;
    return { iNet, iGst, cNet, cGst, pNet, gst, intra, grand: iNet + iGst + cNet + cGst + pNet };
  }, [items, charges, plain, company?.state, v.billState]);

  /* files */
  const okSize = (list, onOk) => {
    const good = [], big = [];
    [...(list || [])].forEach(f => (f.size > MAX_MB * 1048576 ? big.push(f.name) : good.push(f)));
    if (good.length) onOk(good);
    setMsg(big.length ? { ok: false, text: `Too large (over ${MAX_MB} MB): ${big.join(', ')}` } : null);
  };
  const addSpecFiles = (it, list) => okSize(list, good => setSpecFiles(xs => [...xs, ...good.map(f => ({ _id: uid(), itemId: it._id, itemName: it.description, file: f, name: f.name.replace(/\.[^.]+$/, '') }))]));
  const addAtts = list => okSize(list, good => setAtts(xs => [...xs, ...good.map(f => ({ _id: uid(), file: f, name: f.name.replace(/\.[^.]+$/, '') }))]));

  /* validation */
  const check = () => {
    const e = {};
    if (!v.customerName.trim()) e.customerName = 'Choose the client';
    if (!v.orderNo.trim()) e.orderNo = 'Enter the order no.';
    else if (orders.some(o => String(o.orderNo || '').trim().toLowerCase() === v.orderNo.trim().toLowerCase() && String(o.orderId) !== String(editOrder?.orderId))) e.orderNo = 'This order no. is already used';
    if (!v.orderDate) e.orderDate = 'Enter the order date';
    const gstRe = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
    if (v.billGstin && !gstRe.test(v.billGstin)) e.billGstin = 'GSTIN must be 15 characters';
    if (!sameShip && v.shipGstin && !gstRe.test(v.shipGstin)) e.shipGstin = 'GSTIN must be 15 characters';
    const filled = items.filter(it => it.description.trim());
    if (!filled.length) e.items = 'Add at least one product';
    items.forEach((it, i) => {
      if (!it.description.trim() && (n(it.rate) || it.hsnCode)) e[`i${i}`] = 'Enter the product name';
      if (it.description.trim() && n(it.qty) <= 0) e[`q${i}`] = 'Qty?';
    });
    specFiles.concat(atts).forEach(f => { if (!f.name.trim()) e[`n${f._id}`] = 'Name?'; });
    setErrs(e);
    return !Object.keys(e).length;
  };

  const reset = () => {
    setV({ ...EMPTY, orderDate: today() }); setItems([newItem()]); setCharges([]); setPlain([]); setNotes({}); setAddons([]);
    setSpecFiles([]); setAtts([]); setSameShip(true); setErrs({});
  };

  const save = async status => {
    if (!check()) { setMsg({ ok: false, text: 'Please correct the fields marked in red.' }); topRef.current?.scrollIntoView({ behavior: 'smooth' }); return; }
    setBusy(true); setMsg(null);
    try {
      const its = items.filter(it => it.description.trim()).map(it => ({ ...it, qty: n(it.qty), rate: n(it.rate), gst: n(it.gst) }));
      const allCharges = [
        ...charges.filter(c => chargeAmt(c, t.iNet)).map(({ _id, ...c }) => ({
          ...c, amount: r2(chargeAmt(c, t.iNet)), gst: n(c.gst),
          pct: c.mode === 'pct' ? n(c.pct) : '',
          description: c.mode === 'pct' && !c.description.trim() ? `${n(c.pct)}% of taxable` : c.description,
        })),
        ...plain.filter(c => n(c.amount)).map(({ _id, ...c }) => ({ chargeType: 'Other', description: c.description, amount: n(c.amount), gst: 0, withoutGst: true })),
      ];
      const firstDue = its.map(it => it.dueDate).filter(Boolean).sort()[0] || '';   // order due date = earliest product due date
      const fd = new FormData();
      const put = (k, val) => fd.append(k, val == null ? '' : val);
      put('companyId', companyId);
      if (status) put('status', status);
      put('orderNo', v.orderNo.trim()); put('orderDate', v.orderDate); put('quotationRef', v.quotationRef); put('quotationDate', v.quotationDate);
      put('customerPO', v.customerPO); put('poDate', v.poDate); put('dueDate', firstDue); put('deliveryDate', firstDue);
      put('paymentTerms', v.paymentTerms.trim());
      put('customerName', v.customerName); put('customerCode', v.clientId); put('customerGstin', v.billGstin);
      put('contactPerson', v.contactPerson); put('mobile', v.mobile); put('email', v.email);
      put('address', v.billAddress); put('customerCity', v.billCity); put('customerState', v.billState); put('customerPincode', v.billPincode);
      put('shipToName', ship.shipName); put('shipToAddress', ship.shipAddress); put('shipToCity', ship.shipCity);
      put('shipToState', ship.shipState); put('shipToPincode', ship.shipPincode); put('shipToGstin', ship.shipGstin);
      put('billToContact', v.billContact); put('billToMobile', v.billMobile); put('shipToContact', ship.shipContact); put('shipToMobile', ship.shipMobile); put('shipToEmail', v.email);
      put('subTotal', r2(t.iNet + t.cNet + t.pNet)); put('totalGST', r2(t.gst));
      put('cgst', t.intra ? r2(t.gst / 2) : 0); put('sgst', t.intra ? r2(t.gst / 2) : 0); put('igst', t.intra ? 0 : r2(t.gst));
      put('grandTotal', r2(t.grand));
      put('items', JSON.stringify(its));
      put('charges', JSON.stringify(allCharges));
      /* add-on items are material too: one not in the item master yet is added there (Raw Material) so it can be bought and stocked */
      const outAddons = [];
      for (const { _id, forItem, ...a } of addons.filter(x => x.description.trim())) {
        const name = a.description.trim();
        let code = a.itemCode || String((master.find(y => (y.itemName || '').toLowerCase() === name.toLowerCase()) || {}).itemCode || '');
        if (!code) {
          try { const r = await axios.post('/api/items', { companyId, itemType: 'Raw Material', itemName: name, uom: a.unit || 'NOS', hsnCode: '' }, { params: { companyId } }); code = String(r.data?.itemCode || ''); }   // eslint-disable-line no-await-in-loop
          catch { /* item master add failed — the add-on is still saved by name */ }
        }
        const p = addonFor({ forItem });
        outAddons.push({ ...a, description: name, itemCode: code, remarks: (a.remarks || '').trim(),
          ...(p ? { forItemId: p._id, forItemIdx: items.filter(it => it.description.trim()).indexOf(p), forItemName: p.description.trim(), perUnit: n(a.perUnit) || 1 } : { forItemId: '', perUnit: '' }),
          qty: addonQty({ ...a, forItem }) || 1 });
      }
      put('addons', JSON.stringify(outAddons));
      if (!isEdit) { put('scopeItems', '[]'); put('tasks', '[]'); }
      put('specSheet', JSON.stringify({
        mode: 'freewrite', html: '', groups: [],
        itemNotes: its.filter(it => (notes[it._id] || '').trim()).map(it => ({ itemId: it._id, itemName: it.description, text: notes[it._id].trim() })),
      }));
      // saved files keep their stored entry first; new uploads follow (the server fills their paths in order)
      const specOut = [...specFiles.filter(x => x.saved), ...specFiles.filter(x => !x.saved)];
      specOut.filter(x => !x.saved).forEach(x => fd.append('specUploadFiles', x.file));
      put('specFiles', JSON.stringify(specOut.map(x => (x.saved
        ? (({ _id, saved, ...rest }) => ({ ...rest, name: x.name.trim(), itemName: items.find(i => i._id === x.itemId)?.description || x.itemName }))(x)
        : { name: x.name.trim(), fileName: x.file.name, fileType: x.file.name.split('.').pop().toLowerCase(), itemId: x.itemId, itemName: items.find(i => i._id === x.itemId)?.description || x.itemName, category: 'Specification' }))));
      const attOut = [...atts.filter(x => x.saved), ...atts.filter(x => !x.saved)];
      attOut.filter(x => !x.saved).forEach(x => fd.append('attachmentFiles', x.file));
      put('attachments', JSON.stringify(attOut.map(x => (x.saved ? (({ _id, saved, ...rest }) => ({ ...rest, name: x.name.trim() }))(x) : { name: x.name.trim(), fileName: x.file.name }))));
      if (isEdit) {
        await axios.put(`/api/sales-orders/${editOrder.orderId}`, fd, { params: { companyId }, headers: { 'Content-Type': 'multipart/form-data' } });
        setMsg({ ok: true, text: `Sales Order ${v.orderNo.trim()} updated.` });
        onSaved?.();
      } else {
        const r = await axios.post('/api/sales-orders', fd, { params: { companyId }, headers: { 'Content-Type': 'multipart/form-data' } });
        setMsg({ ok: true, text: `Sales Order ${v.orderNo.trim()}${r.data?.orderId ? ` (ID ${r.data.orderId})` : ''} saved ${status === 'pending' ? 'and sent for approval' : 'as draft'}.` });
        reset(); loadNext(); onSaved?.();
      }
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || 'Could not save the sales order. Try again.' });
    } finally { setBusy(false); }
  };

  const inp = (k, props = {}) => {
    const { className = '', ...rest } = props;
    return <input id={`so-${k}`} value={v[k]} onChange={set(k)} disabled={busy} {...rest} className={`${className}${errs[k] ? ' bad' : ''}`} />;
  };
  const err = k => errs[k] && <span className="so-err">{errs[k]}</span>;
  const head = (icon, title, sub, extra) => (
    <div className="so-ch"><span className="ico"><Svg name={icon} size={16} /></span><span className="t"><b>{title}</b>{sub && <small>{sub}</small>}</span>{extra}</div>
  );
  const stateSel = (k, dis) => (
    <select id={`so-${k}`} value={dis ? ship[k] : v[k]} onChange={set(k)} disabled={busy || dis}>
      <option value="">Select state</option>{STATES.map(s => <option key={s} value={s}>{s}</option>)}
    </select>
  );
  const shipInp = (k, props = {}) => (sameShip
    ? <input id={`so-${k}`} value={ship[k] || ''} readOnly className={props.className || ''} />
    : inp(k, props));
  const named = items.filter(it => it.description.trim());

  return (
    <div className="so">
      <style>{CSS}</style>
      <datalist id="so-items">{master.map(m => <option key={m.itemCode || m.itemName} value={m.itemName}>{m.itemCode ? `#${m.itemCode}` : ''}</option>)}</datalist>
      <div className="so-in">
        <div className="so-hero" ref={topRef}>
          <span className="ic"><Svg name="file" size={16} /></span>
          <div style={{ position: 'relative', zIndex: 1 }}><h1>{isEdit ? `Edit Sales Order — ${editOrder.orderNo || editOrder.orderId}` : 'Create Sales Order'}</h1></div>
          <span className="grow" />
          {!isEdit && <button type="button" className="so-copy" onClick={() => setPicker({ kind: 'copy' })} disabled={busy} title="Copy client, products, rates, charges and specs from an existing order">
            <Svg name="file" size={13} />Copy from order</button>}
          <div className="so-chip"><small>SO ID</small><b>{isEdit ? editOrder.orderId : (nextId || 'Auto')}</b></div>
        </div>

        {msg && <div className={`so-msg ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</div>}

        {/* 1 — client | order  (label | value rows, like the e-Way Bill form) */}
        <div className="so-2">
          <div className="so-card">
            {head('user', 'Client Details')}
            <table className="so-kv"><tbody>
              <tr><th>Client <i>*</i></th><td colSpan={3}>
                <div className="so-srch">
                  <input id="so-client" value={v.customerName} readOnly placeholder="Click search to choose the client"
                    className={errs.customerName ? 'bad' : ''} onClick={() => !busy && setPicker({ kind: 'client' })} />
                  <button type="button" className="so-sbtn" onClick={() => setPicker({ kind: 'client' })} disabled={busy} title="Search client" aria-label="Search client"><Svg name="search" size={15} /></button>
                </div>
                {err('customerName')}
              </td></tr>
              <tr><th>Client ID</th><td><input value={v.clientId} readOnly /></td><th className="sm">GSTIN</th><td><input value={v.billGstin} readOnly className="mono" /></td></tr>
              <tr><th>Contact Person</th><td>{inp('contactPerson')}</td><th className="sm">Mobile</th><td>{inp('mobile', { inputMode: 'tel' })}</td></tr>
              <tr><th>Email</th><td colSpan={3}>{inp('email', { type: 'email' })}</td></tr>
            </tbody></table>
          </div>

          <div className="so-card">
            {head('file', 'Order Details')}
            <table className="so-kv"><tbody>
              <tr><th>Order / File No. <i>*</i></th><td>{inp('orderNo', { placeholder: 'e.g. EESO2627101', className: 'mono' })}{err('orderNo')}</td>
                <th className="sm">Date <i>*</i></th><td>{inp('orderDate', { type: 'date' })}{err('orderDate')}</td></tr>
              <tr><th>Quote Ref. No.</th><td>{inp('quotationRef')}</td><th className="sm">Date</th><td>{inp('quotationDate', { type: 'date' })}</td></tr>
              <tr><th>Client PO No.</th><td>{inp('customerPO')}</td><th className="sm">Date</th><td>{inp('poDate', { type: 'date' })}</td></tr>
              <tr><th>Payment Terms</th><td colSpan={3}>{inp('paymentTerms', { placeholder: 'e.g. 30% advance, balance within 30 days of delivery' })}</td></tr>
            </tbody></table>
          </div>
        </div>

        {/* 2 — bill to | ship to */}
        <div className="so-2">
          <div className="so-card">
            {head('biz', 'Bill To')}
            <table className="so-kv"><tbody>
              <tr><th>Name</th><td colSpan={3}>{inp('billName')}</td></tr>
              <tr><th>Address</th><td colSpan={3}><textarea id="so-billAddress" value={v.billAddress} onChange={set('billAddress')} disabled={busy} rows={2} /></td></tr>
              <tr><th>City</th><td>{inp('billCity')}</td><th>Pincode</th><td>{inp('billPincode', { inputMode: 'numeric' })}</td></tr>
              <tr><th>State</th><td>{stateSel('billState')}</td><th>GSTIN</th><td>{inp('billGstin', { className: 'mono' })}{err('billGstin')}</td></tr>
              <tr><th>Contact Person</th><td>{inp('billContact')}</td><th>Mobile</th><td>{inp('billMobile', { inputMode: 'tel' })}</td></tr>
            </tbody></table>
          </div>
          <div className="so-card">
            {head('globe', 'Ship To', null, <><span className="grow" />
              <label className="so-same"><input type="checkbox" checked={sameShip} disabled={busy}
                onChange={e => { const on = e.target.checked; if (!on) setV(o => ({ ...o, shipName: o.billName, shipAddress: o.billAddress, shipCity: o.billCity, shipState: o.billState, shipPincode: o.billPincode, shipGstin: o.billGstin, shipContact: o.billContact, shipMobile: o.billMobile })); setSameShip(on); }} />
                Same as Bill To</label></>)}
            <table className="so-kv"><tbody>
              <tr><th>Name</th><td colSpan={3}>{shipInp('shipName')}</td></tr>
              <tr><th>Address</th><td colSpan={3}>
                <textarea id="so-shipAddress" value={sameShip ? ship.shipAddress : v.shipAddress} onChange={set('shipAddress')} readOnly={sameShip} disabled={busy} rows={2} className={sameShip ? 'ro' : ''} />
              </td></tr>
              <tr><th>City</th><td>{shipInp('shipCity')}</td><th>Pincode</th><td>{shipInp('shipPincode', { inputMode: 'numeric' })}</td></tr>
              <tr><th>State</th><td>{stateSel('shipState', sameShip)}</td><th>GSTIN</th><td>{shipInp('shipGstin', { className: 'mono' })}{err('shipGstin')}</td></tr>
              <tr><th>Contact Person</th><td>{shipInp('shipContact')}</td><th>Mobile</th><td>{shipInp('shipMobile', { inputMode: 'tel' })}</td></tr>
            </tbody></table>
          </div>
        </div>

        {/* 3 — products */}
        <div className="so-card">
          {head('box', 'Product Details', null, <><span className="grow" />
            {named.length > 0 && <span className="cnt">{named.length} product{named.length > 1 ? 's' : ''}</span>}
            <button type="button" className="so-add" disabled={busy} onClick={() => setItems(xs => [...xs, newItem()])}>+ Add product</button></>)}
          {errs.items && <div className="so-empty" style={{ color: '#D92D20' }}>{errs.items}</div>}
          <div className="so-tw">
            <table className="so-t">
              <thead><tr><th /><th style={{ width: '30%' }}>Product</th><th>Item Code</th><th>HSN</th><th>Due Date</th><th className="r">Qty</th><th>Unit</th><th className="r">Rate</th><th>GST %</th><th className="r">Amount</th><th className="r">Total</th><th className="x" /></tr></thead>
              <tbody>
                {items.map((it, i) => {
                  const a = n(it.qty) * n(it.rate);
                  const mine = addons.map((x, k) => [x, k]).filter(([x]) => x.forItem === it._id);
                  return (
                    <React.Fragment key={it._id}>
                    <tr className={mine.length ? 'so-hasad' : ''}>
                      <td className="sn">{i + 1}</td>
                      <td>
                        <div className="so-srch">
                          <input list="so-items" value={it.description} onChange={e => pickMaster(i, e.target.value)} disabled={busy} placeholder="Search or type product" className={errs[`i${i}`] ? 'bad' : ''} aria-label={`Product ${i + 1}`} />
                          <button type="button" className="so-sbtn" onClick={() => setPicker({ kind: 'item', row: i })} disabled={busy} title="Search product" aria-label={`Search product ${i + 1}`}><Svg name="search" size={15} /></button>
                        </div>
                        {err(`i${i}`)}
                        <div className="so-src" role="group" aria-label={`Product ${i + 1}: buy or make`}>
                          <button type="button" className={it.source !== 'make' ? 'on' : ''} aria-pressed={it.source !== 'make'} onClick={() => setItem(i, 'source', 'buy')} disabled={busy} title="Bought from a vendor on a PO">Buy</button>
                          <button type="button" className={it.source === 'make' ? 'on mk' : ''} aria-pressed={it.source === 'make'} onClick={() => setItem(i, 'source', 'make')} disabled={busy} title="Made in our factory">Make</button>
                          <span>{it.source === 'make' ? 'Made in our factory' : 'PO to vendor'}</span>
                        </div>
                      </td>
                      <td style={{ width: 90 }}><input value={it.itemCode} onChange={e => setItem(i, 'itemCode', e.target.value)} disabled={busy} className="mono" aria-label="Item code" /></td>
                      <td style={{ width: 90 }}><input value={it.hsnCode} onChange={e => setItem(i, 'hsnCode', e.target.value.replace(/\D/g, '').slice(0, 8))} disabled={busy} className="mono" aria-label="HSN" /></td>
                      <td style={{ width: 140 }}><input type="date" value={it.dueDate || ''} onChange={e => setItem(i, 'dueDate', e.target.value)} disabled={busy} aria-label={`Due date of product ${i + 1}`} /></td>
                      <td style={{ width: 80 }}><input value={it.qty} onChange={e => setItem(i, 'qty', e.target.value.replace(/[^\d.]/g, ''))} disabled={busy} inputMode="decimal" className={`num${errs[`q${i}`] ? ' bad' : ''}`} aria-label="Qty" /></td>
                      <td style={{ width: 84 }}><select value={it.unit} onChange={e => setItem(i, 'unit', e.target.value)} disabled={busy} aria-label="Unit">{[...new Set([...UNITS, it.unit])].map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                      <td style={{ width: 120 }}><input value={it.rate} onChange={e => setItem(i, 'rate', e.target.value.replace(/[^\d.]/g, ''))} disabled={busy} inputMode="decimal" className="num" placeholder="0.00" aria-label="Rate" /></td>
                      <td style={{ width: 78 }}><select value={it.gst} onChange={e => setItem(i, 'gst', n(e.target.value))} disabled={busy} aria-label="GST %">{[...new Set([...GST_RATES, n(it.gst)])].map(g => <option key={g} value={g}>{g}%</option>)}</select></td>
                      <td className="val" style={{ width: 110 }}>{amt(a)}</td>
                      <td className="val" style={{ width: 120 }}><b>{amt(a * (1 + n(it.gst) / 100))}</b></td>
                      <td className="x">{items.length > 1 && <button type="button" className="so-rm" title="Remove product" aria-label={`Remove product ${i + 1}`} onClick={() => setItems(xs => xs.filter((_, j) => j !== i))}>×</button>}</td>
                    </tr>
                    {/* add-ons of this product — qty per piece × product qty */}
                    <tr className="so-adbox"><td />
                      <td colSpan={11}>
                        {mine.length > 0 && <table className="so-t so-adt"><tbody>{mine.map(([x, k]) => addonRow(x, k, true))}</tbody></table>}
                        <div className="so-adbar">
                          <span>Add-on{it.description.trim() ? ` with ${it.description.trim()}` : ''}:</span>
                          {ADDON_QUICK.map(q => <button key={q} type="button" disabled={busy} onClick={() => setAddons(xs => [...xs, newAddon(q, it._id)])}>{q}</button>)}
                          <button type="button" className="add" disabled={busy} onClick={() => setAddons(xs => [...xs, newAddon('', it._id)])}>+ Add-on item</button>
                        </div>
                      </td>
                    </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="so-sub"><span>Taxable <b>{amt(t.iNet)}</b></span><span>GST <b>{amt(t.iGst)}</b></span><span>Products total <b>{amt(t.iNet + t.iGst)}</b></span></div>
        </div>

        {/* add-on items for the whole order (not tied to one product) — product add-ons sit under each product above */}
        {(() => {
          const whole = addons.map((x, k) => [x, k]).filter(([x]) => !addonFor(x));
          return (
            <div className="so-card">
              {head('box', 'Add-on items — whole order', 'Not tied to one product · add-ons of a product go under that product above', <><span className="grow" />
                <button type="button" className="so-add" disabled={busy} onClick={() => setAddons(xs => [...xs, newAddon('', '')])}>+ Add item</button></>)}
              {whole.length ? (
                <div className="so-tw"><table className="so-t">
                  <thead><tr><th /><th style={{ width: '18%' }}>For product</th><th style={{ width: '22%' }}>Item</th><th>Category</th><th style={{ width: '18%' }}>Specification / remarks</th><th className="r">Per pc</th><th className="r">Qty</th><th>Unit</th><th>In price</th><th className="x" /></tr></thead>
                  <tbody>{whole.map(([x, k]) => addonRow(x, k, false))}</tbody>
                </table></div>
              ) : <div className="so-empty">None. Add-ons that go with a product (AC with a cabin…) are added under that product.</div>}
            </div>
          );
        })()}

        {/* 4 — additional charges (GST) | 5 — without GST  + totals */}
        <div className="so-card">
          {head('plus', 'Additional charges', 'Freight, packing, installation… with GST', <><span className="grow" />
            <button type="button" className="so-add" disabled={busy} onClick={() => setCharges(xs => [...xs, newCharge()])}>+ Add charge</button></>)}
          {charges.length ? (
            <div className="so-tw"><table className="so-t">
              <thead><tr><th /><th>Charge</th><th style={{ width: '28%' }}>Description</th><th>Calculate</th><th className="r">% / Amount</th><th className="r">Amount</th><th>GST %</th><th className="r">Total</th><th className="x" /></tr></thead>
              <tbody>{charges.map((c, i) => {
                const a = chargeAmt(c, t.iNet);
                return (
                  <tr key={c._id}>
                    <td className="sn">{i + 1}</td>
                    <td style={{ width: 200 }}><select value={c.chargeType} onChange={e => setCharge(i, 'chargeType', e.target.value)} disabled={busy} aria-label="Charge">{CHARGE_TYPES.map(x => <option key={x} value={x}>{x}</option>)}</select></td>
                    <td><input value={c.description} onChange={e => setCharge(i, 'description', e.target.value)} disabled={busy} placeholder="Details (optional)" aria-label="Charge description" /></td>
                    <td style={{ width: 178 }}>
                      <div className="so-seg" role="radiogroup" aria-label="How to calculate">
                        <button type="button" role="radio" aria-checked={c.mode !== 'pct'} className={c.mode !== 'pct' ? 'on' : ''} disabled={busy} onClick={() => setCharge(i, 'mode', 'amount')}>Amount</button>
                        <button type="button" role="radio" aria-checked={c.mode === 'pct'} className={c.mode === 'pct' ? 'on' : ''} disabled={busy} onClick={() => setCharge(i, 'mode', 'pct')}>% of Taxable</button>
                      </div>
                    </td>
                    <td style={{ width: 120 }}>
                      {c.mode === 'pct' ? (
                        <div className="so-pct"><input value={c.pct} onChange={e => setCharge(i, 'pct', e.target.value.replace(/[^\d.]/g, ''))} disabled={busy} inputMode="decimal" className="num" placeholder="0" aria-label="Percent of taxable" /><span>%</span></div>
                      ) : (
                        <input value={c.amount} onChange={e => setCharge(i, 'amount', e.target.value.replace(/[^\d.]/g, ''))} disabled={busy} inputMode="decimal" className="num" placeholder="0.00" aria-label="Charge amount" />
                      )}
                    </td>
                    <td className="val" style={{ width: 110 }} title={c.mode === 'pct' ? `${n(c.pct)}% of ${amt(t.iNet)}` : undefined}>{amt(a)}</td>
                    <td style={{ width: 80 }}><select value={c.gst} onChange={e => setCharge(i, 'gst', n(e.target.value))} disabled={busy} aria-label="Charge GST">{GST_RATES.map(g => <option key={g} value={g}>{g}%</option>)}</select></td>
                    <td className="val" style={{ width: 120 }}><b>{amt(a * (1 + n(c.gst) / 100))}</b></td>
                    <td className="x"><button type="button" className="so-rm" title="Remove charge" aria-label={`Remove charge ${i + 1}`} onClick={() => setCharges(xs => xs.filter((_, j) => j !== i))}>×</button></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          ) : <div className="so-empty">No additional charges.</div>}
        </div>

        <div className="so-sum">
          <div className="so-card" style={{ marginBottom: 0 }}>
            {head('wallet', 'Charges without GST', 'Amounts added to the total with no GST', <><span className="grow" />
              <button type="button" className="so-add" disabled={busy} onClick={() => setPlain(xs => [...xs, newPlain()])}>+ Add</button></>)}
            {plain.length ? (
              <table className="so-t" style={{ minWidth: 0 }}>
                <thead><tr><th /><th>Description</th><th className="r">Amount</th><th className="x" /></tr></thead>
                <tbody>{plain.map((c, i) => (
                  <tr key={c._id}>
                    <td className="sn">{i + 1}</td>
                    <td><input value={c.description} onChange={e => setPl(i, 'description', e.target.value)} disabled={busy} placeholder="e.g. Toll / reimbursement" aria-label="Description" /></td>
                    <td style={{ width: 150 }}><input value={c.amount} onChange={e => setPl(i, 'amount', e.target.value.replace(/[^\d.]/g, ''))} disabled={busy} inputMode="decimal" className="num" placeholder="0.00" aria-label="Amount" /></td>
                    <td className="x"><button type="button" className="so-rm" title="Remove" aria-label={`Remove ${i + 1}`} onClick={() => setPlain(xs => xs.filter((_, j) => j !== i))}>×</button></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div className="so-empty">None.</div>}
          </div>
          <div className="so-tot" aria-label="Order total">
            <div className="row"><span>Products (taxable)</span><b>{amt(t.iNet)}</b></div>
            <div className="row"><span>Additional charges</span><b>{amt(t.cNet)}</b></div>
            {t.intra ? <>
              <div className="row"><span>CGST</span><b>{amt(t.gst / 2)}</b></div>
              <div className="row"><span>SGST</span><b>{amt(t.gst / 2)}</b></div>
            </> : <div className="row"><span>IGST</span><b>{amt(t.gst)}</b></div>}
            <div className="row"><span>Charges without GST</span><b>{amt(t.pNet)}</b></div>
            <div className="row gt"><span>Grand total</span><b>₹ {amt(t.grand)}</b></div>
            <div className="tax">{t.intra ? 'Same state — CGST + SGST' : 'Other state — IGST'}</div>
          </div>
        </div>

        {/* 6 — specs item-wise */}
        <div className="so-card">
          {head('ledger', 'Specifications — item wise', 'Notes and drawings for each product')}
          {named.length ? named.map(it => {
            const fl = specFiles.filter(f => f.itemId === it._id);
            return (
              <div className="so-spec" key={it._id}>
                <div className="nm"><b>{it.description}</b><small>{n(it.qty)} {it.unit}{it.hsnCode ? ` · HSN ${it.hsnCode}` : ''}</small></div>
                <div className="bd">
                  <textarea value={notes[it._id] || ''} onChange={e => setNotes(o => ({ ...o, [it._id]: e.target.value }))} disabled={busy} rows={2} placeholder="Size, material, finish, standards…" aria-label={`Specification for ${it.description}`} />
                  <div className="so-files">
                    {fl.map(f => (
                      <span className="so-file" key={f._id} title={fileNameOf(f)}>
                        <span className="ext">{extOf(fileNameOf(f))}</span><span className="nm2">{f.saved ? (f.name || fileNameOf(f)) : fileNameOf(f)}</span><small style={{ color: '#98A2B3' }}>{f.file ? fileSize(f.file.size) : 'Saved'}</small>
                        <button type="button" aria-label={`Remove ${fileNameOf(f)}`} onClick={() => setSpecFiles(xs => xs.filter(x => x._id !== f._id))}>×</button>
                      </span>
                    ))}
                    <label className="so-up"><Svg name="plus" size={13} stroke={2.2} />Drawing / file
                      <input type="file" multiple hidden onChange={e => { addSpecFiles(it, e.target.files); e.target.value = ''; }} />
                    </label>
                  </div>
                </div>
              </div>
            );
          }) : <div className="so-empty">Add a product above to write its specification.</div>}
        </div>

        {/* 7 — attachments */}
        <div className="so-card">
          {head('folder', 'Attachments', 'Client PO, quotation, approvals…', atts.length ? <><span className="grow" /><span className="cnt">{atts.length} file{atts.length > 1 ? 's' : ''}</span></> : null)}
          <div className={`so-drop${over ? ' over' : ''}`} role="button" tabIndex={0}
            onClick={() => attRef.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); attRef.current?.click(); } }}
            onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); addAtts(e.dataTransfer.files); }}>
            <div className="ic"><Svg name="plus" size={18} stroke={2.2} /></div>
            <b>Drag files here or <u>browse</u></b>
            <small>Any file — up to {MAX_MB} MB each</small>
            <input ref={attRef} type="file" multiple hidden onChange={e => { addAtts(e.target.files); e.target.value = ''; }} />
          </div>
          {atts.map((a, i) => (
            <div className="so-att" key={a._id}>
              <span className="ext">{extOf(fileNameOf(a))}</span>
              <span className="fn"><b title={fileNameOf(a)}>{fileNameOf(a)}</b><small>{a.file ? fileSize(a.file.size) : 'Saved'}</small></span>
              <span><input value={a.name} onChange={e => { const val = e.target.value; setAtts(xs => xs.map((x, j) => (j === i ? { ...x, name: val } : x))); }} disabled={busy} placeholder="Name, e.g. Client PO" className={errs[`n${a._id}`] ? 'bad' : ''} aria-label={`Name for ${fileNameOf(a)}`} /></span>
              <button type="button" className="so-rm" aria-label={`Remove ${fileNameOf(a)}`} onClick={() => setAtts(xs => xs.filter(x => x._id !== a._id))}>×</button>
            </div>
          ))}
          {atts.length > 0 && <div style={{ height: 8 }} />}
        </div>
      </div>

      {picker?.kind === 'client' && (
        <Picker title="Select Client" placeholder="Search by name, client ID, GSTIN, city…" rows={clients}
          keyOf={c => c.clientId} textOf={c => `${c.clientId} ${c.companyName || c.clientName || ''} ${c.gstin || ''} ${c.city || ''} ${c.state || ''}`}
          cols={[['ID', c => c.clientId, 80], ['Client Name', c => c.companyName || c.clientName], ['GSTIN', c => c.gstin, 150], ['City', c => c.city, 120], ['State', c => c.state, 120],
            ['Status', c => (c.status === 'suspended' ? <span className="so-susp">Suspended</span> : ''), 100]]}
          onPick={chooseClient} onClose={() => setPicker(null)} />
      )}
      {picker?.kind === 'copy' && (
        <Picker title="Copy from Order" placeholder="Search by order no., client, client PO or product…"
          rows={[...orders].sort((a, b) => String(b.orderDate || '').localeCompare(String(a.orderDate || '')))}
          keyOf={o => o.orderId} textOf={o => `${o.orderNo || ''} ${o.customerName || o.party || ''} ${o.customerPO || ''} ${(o.items || []).map(it => it.description || it.material || it.itemName || '').join(' ')}`}
          cols={[['Order No.', o => o.orderNo || o.orderId, 120], ['Date', o => o.orderDate, 95], ['Client', o => o.customerName || o.party], ['Client PO', o => o.customerPO, 150],
            ['Products', o => (o.items || []).map(it => it.description || it.material || it.itemName).filter(Boolean).join(', ')], ['Grand Total', o => (o.grandTotal ? amt(o.grandTotal) : ''), 110]]}
          onPick={o => { setPicker(null); setCopyFrom(o); setCopyWhat({ client: true, items: true, charges: true, specs: true, terms: true }); }} onClose={() => setPicker(null)} />
      )}
      {copyFrom && (
        <div className="so-pkb" onMouseDown={e => { if (e.target === e.currentTarget) setCopyFrom(null); }}>
          <div className="so-pk so-cp" role="dialog" aria-modal="true" aria-label="What to copy" onKeyDown={e => { if (e.key === 'Escape') setCopyFrom(null); }}>
            <div className="so-pkh"><b>Copy from {copyFrom.orderNo || copyFrom.orderId}</b><span className="grow" /><small>{copyFrom.customerName || copyFrom.party}</small>
              <button type="button" onClick={() => setCopyFrom(null)} aria-label="Close">×</button></div>
            <div className="so-cpb">
              {[['client', 'Client, Bill To & Ship To', copyFrom.customerName || copyFrom.party],
                ['items', 'Products — qty, rate, GST, HSN', `${(copyFrom.items || []).length} product${(copyFrom.items || []).length === 1 ? '' : 's'}`],
                ['specs', 'Item-wise specifications', copyWhat.items ? '' : 'needs products'],
                ['charges', 'Additional charges (with and without GST)', `${(copyFrom.charges || []).length} charge${(copyFrom.charges || []).length === 1 ? '' : 's'}`],
                ['terms', 'Payment terms', copyFrom.paymentTerms || '—']].map(([k, label, hint]) => (
                <label key={k} className={`so-cpi${copyWhat[k] && (k !== 'specs' || copyWhat.items) ? ' on' : ''}`}>
                  <input type="checkbox" checked={!!copyWhat[k] && (k !== 'specs' || copyWhat.items)} disabled={k === 'specs' && !copyWhat.items}
                    onChange={e => setCopyWhat(w => ({ ...w, [k]: e.target.checked }))} autoFocus={k === 'client'} />
                  <span>{label}</span><small>{hint}</small>
                </label>
              ))}
              <p className="so-cpn">Not copied: order no., order date, client PO, quotation, attachments. Item due dates are left empty. Products, charges and specs replace what is in the form now.</p>
            </div>
            <div className="so-cpf">
              <button type="button" className="so-b ghost" onClick={() => setCopyFrom(null)}>Cancel</button>
              <button type="button" className="so-b pri" onClick={applyCopy} disabled={!Object.values(copyWhat).some(Boolean)}>Copy</button>
            </div>
          </div>
        </div>
      )}
      {picker?.kind === 'item' && (
        <Picker title="Select Product" placeholder="Search by item code, name or HSN…" rows={master}
          keyOf={m => m.itemCode || m.itemName} textOf={m => `${m.itemCode || ''} ${m.itemName || ''} ${m.hsnCode || ''}`}
          cols={[['Code', m => m.itemCode, 80], ['Item Name', m => m.itemName], ['HSN', m => m.hsnCode, 90], ['Unit', m => m.unit || m.uom, 60],
            ['GST', m => (m.gst != null && m.gst !== '' ? `${m.gst}%` : ''), 60], ['Rate', m => m.saleRate || m.rate, 90]]}
          onPick={m => chooseItem(picker.row, m)} onClose={() => setPicker(null)} />
      )}

      <div className="so-bar">
        <span className="info">{v.customerName ? <>{v.customerName}{v.orderNo ? ` · ${v.orderNo}` : ''} · Grand total <b>₹ {amt(t.grand)}</b></> : 'Choose a client to start'}</span>
        {isEdit ? <>
          <button type="button" className="so-b ghost" disabled={busy} onClick={onClose}>Back to list</button>
          <button type="button" className="so-b pri" disabled={busy} onClick={() => save(null)}>{busy ? 'Saving…' : 'Save Changes'}</button>
        </> : <>
          <button type="button" className="so-b ghost" disabled={busy} onClick={() => { reset(); setMsg(null); }}>Clear</button>
          <button type="button" className="so-b draft" disabled={busy} onClick={() => save('draft')}>Save Draft</button>
          <button type="button" className="so-b pri" disabled={busy} onClick={() => save('pending')}>{busy ? 'Saving…' : 'Submit for Approval'}</button>
        </>}
      </div>
    </div>
  );
}
