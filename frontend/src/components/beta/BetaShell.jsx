/* New (beta) app frame: slim side nav + top bar around the normal pages.
 * Used instead of the classic Header / SidebarNav / SubNav when the person signed in from the
 * new sign-in page (utils/uiVersion).
 * Top bar: search (middle) · active company · profile menu (Profile settings, Chat, Logout). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';
import { useChat } from '../../context/ChatContext';
import { can } from '../../utils/permissions';
import { PRODUCT_NAME } from '../../utils/brand';
import { Svg } from '../ui/Icon';
import { VOUCHERS, isTransactionPath } from '../VoucherBar';
import BetaDashboard from '../../pages/beta/BetaDashboard';
import BetaClients from '../../pages/beta/BetaClients';
import BetaOrders from '../../pages/beta/BetaOrders';
import BetaProforma from '../../pages/beta/BetaProforma';
import BetaReceipt from '../../pages/beta/BetaReceipt';
import BetaDues from '../../pages/beta/BetaDues';
import BetaSales from '../../pages/beta/BetaSales';
import BetaDC from '../../pages/beta/BetaDC';
import BetaPasswords from '../../pages/beta/BetaPasswords';
import BetaVendors from '../../pages/beta/BetaVendors';
import BetaPO from '../../pages/beta/BetaPO';
import BetaPayment from '../../pages/beta/BetaPayment';
import BetaPurchaseDues from '../../pages/beta/BetaPurchaseDues';
import BetaPurchaseBill from '../../pages/beta/BetaPurchaseBill';
import BetaGRN from '../../pages/beta/BetaGRN';
import BetaReturns from '../../pages/beta/BetaReturns';
import BetaStock from '../../pages/beta/BetaStock';
import BetaRawMaterial, { RawStock } from '../../pages/beta/BetaRawMaterial';
import BetaMfg from '../../pages/beta/BetaMfg';
import BetaItems from '../../pages/beta/BetaItems';
import BetaBG from '../../pages/beta/BetaBG';
import BetaWarranty from '../../pages/beta/BetaWarranty';
import BetaCompletion from '../../pages/beta/BetaCompletion';
import BetaProfile from '../../pages/beta/BetaProfile';
import BetaInsurance, { insCan } from '../../pages/beta/BetaInsurance';
import BetaAccPayment from '../../pages/beta/BetaAccPayment';
import BetaBooks from '../../pages/beta/BetaBooks';
import BetaGstReturns from '../../pages/beta/BetaGstReturns';
import BetaGstPortal from '../../pages/beta/BetaGstPortal';
import BetaFixedAssets from '../../pages/beta/BetaFixedAssets';
import BetaJournal from '../../pages/beta/BetaJournal';
import BetaNotes from '../../pages/beta/BetaNotes';
import BetaExpense from '../../pages/beta/BetaExpense';
import BetaHREmployees from '../../pages/beta/BetaHREmployees';
import BetaHRAssets from '../../pages/beta/BetaHRAssets';
import BetaHRAttendance from '../../pages/beta/BetaHRAttendance';
import BetaHRPayroll from '../../pages/beta/BetaHRPayroll';
import BetaHRPolicy from '../../pages/beta/BetaHRPolicy';
import { hrCan } from '../../pages/beta/BetaHRKit';
import BetaJobSheet from '../../pages/beta/BetaJobSheet';
import BetaJobcode from '../../pages/beta/BetaJobcode';
import ApprovalView from '../../pages/approval/View';
import Companies from '../../pages/admin/Companies';
import AdminUsers from '../../pages/admin/Users';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const LAST_VOUCHER_KEY = 'bx-last-voucher';   // the voucher screen used last — V opens it again (like Tally)

/* true while the person is typing somewhere — single-letter keys must not fire then */
const typing = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
/* the colour of each module's icon in the side nav (white icon on a coloured tile) */
const NAV_COLOR = {
  so: '#2E90FA', po: '#F79009', job: '#7A5AF8', mfg: '#E9A100', stock: '#12B76A', acc: '#06AED4', books: '#6172F3',
  hr: '#EE46BC', ins: '#F04438', pm: '#66C61C', admin: '#9E77ED', crm: '#0BA5EC', gst: '#DD2590', dash: '#15B79E',
};
/* Finacle-style menu shortcuts: type the code in the "Menu" box (top bar) and press Enter to open the page */
const SHORTCUTS = {
  '/dashboard': 'DASH',
  '/beta/client': 'CLNT', '/beta/order': 'SO', '/beta/order?tab=create': 'SOC', '/beta/proforma': 'PI', '/beta/receipt': 'RCPT', '/beta/sales': 'SINV',
  '/beta/delivery-challan': 'DC', '/beta/return-note': 'RN', '/beta/warranty': 'WTY', '/beta/completion': 'CC', '/beta/bank-guarantee': 'BG', '/beta/dues': 'SDUE',
  '/beta/vendor': 'VEND', '/beta/po': 'PO', '/beta/payment': 'PPAY', '/beta/purchase-bill': 'PBILL', '/beta/grn': 'GRN', '/beta/return-vendor': 'RTV', '/beta/purchase-dues': 'PDUE',
  '/beta/jobcode': 'JOB',
  '/beta/mfg/job-sheet': 'JS', '/beta/mfg/bom': 'BOM', '/beta/mfg/raw-material': 'RM', '/beta/mfg/issue': 'MI', '/beta/mfg/mrp': 'MRP', '/beta/mfg/qc': 'QC', '/beta/mfg/cost': 'PCOST',
  '/beta/items': 'ITEM', '/beta/stock': 'STK', '/beta/raw-stock': 'RMSTK',
  '/beta/account/payment': 'PAY', '/beta/account/receipt': 'REC', '/beta/account/journal': 'JV', '/beta/account/debit-note': 'DN', '/beta/account/credit-note': 'CN',
  '/beta/account/expense': 'EXP', '/beta/account/expense?tab=create': 'EXPC',
  '/beta/books/ledger': 'LED', '/beta/books/chart': 'COA', '/beta/books/trial': 'TB', '/beta/books/pl': 'PL', '/beta/books/bs': 'BS', '/beta/books/cash': 'CB',
  '/beta/books/gst': 'GST', '/beta/books/gst-portal': 'GSTP', '/beta/books/tds': 'TDS', '/beta/books/ageing': 'AGE', '/beta/books/assets': 'FA',
  '/beta/hr/employees': 'EMP', '/beta/hr/assets': 'HRA', '/beta/hr/attendance': 'ATT', '/beta/hr/payroll': 'PR', '/beta/hr/policy': 'HRP',
  '/beta/insurance/policies': 'INS', '/beta/insurance/claims': 'CLM', '/beta/passwords': 'PWD',
  '/beta/admin/approvals': 'APR', '/beta/admin/company': 'CO', '/beta/admin/users': 'USR',
  '/beta/profile': 'PROF', '/beta/profile?tab=signature': 'SIGN',
};
/* extra entries that are not in the side nav (create screens, own profile) */
const EXTRA_PAGES = [
  { path: '/dashboard', label: 'Dashboard', group: 'Home', key: 'dash' },
  { path: '/beta/order?tab=create', label: 'Create sales order', group: 'Sales Order', key: 'so', perm: 'salesOrder' },
  { path: '/beta/account/expense?tab=create', label: 'Add expense', group: 'Account', key: 'acc', perm: 'accExpense' },
  { path: '/beta/profile', label: 'My profile', group: 'Me', key: 'pm' },
  { path: '/beta/profile?tab=signature', label: 'My signature', group: 'Me', key: 'pm' },
];
/* side nav buttons — added one by one as decided */
const SIDE_NAV = [
  { key: 'so', label: 'Sales Order', icon: 'file', perm: 'salesOrder',
    sub: [
      { label: 'Client', path: '/beta/client' },
      { label: 'Order', path: '/beta/order' }, { label: 'Proforma Invoice', path: '/beta/proforma' }, { label: 'Receipt', path: '/beta/receipt' }, { label: 'Sales', path: '/beta/sales' }, { label: 'Delivery Challan', path: '/beta/delivery-challan' }, { label: 'Return Note', path: '/beta/return-note' },
      { label: 'Warranty Certificate', path: '/beta/warranty' }, { label: 'Completion Certificate', path: '/beta/completion' }, { label: 'BG / FD / SD', path: '/beta/bank-guarantee', perm: 'accDeposit' }, { label: 'Dues', path: '/beta/dues' },
    ] },
  { key: 'po', label: 'Purchase Order', icon: 'cart', perm: 'purchaseOrder',
    sub: [
      { label: 'Vendor', path: '/beta/vendor' }, { label: 'PO', path: '/beta/po' }, { label: 'Payment', path: '/beta/payment' }, { label: 'Purchase', path: '/beta/purchase-bill' }, { label: 'Goods Receipt', path: '/beta/grn' }, { label: 'Return to Vendor', path: '/beta/return-vendor' }, { label: 'Dues', path: '/beta/purchase-dues' },
    ] },
  { key: 'job', label: 'Jobcode', icon: 'folder', perm: 'project', path: '/beta/jobcode' },
  { key: 'mfg', label: 'Manufacturing', icon: 'factory', perm: 'mfgOrders',
    sub: [
      { label: 'Job Sheet', path: '/beta/mfg/job-sheet', perm: 'jobSheets' }, { label: 'BOM', path: '/beta/mfg/bom', perm: 'mfgOrders' }, { label: 'Raw Material', path: '/beta/mfg/raw-material' },
      { label: 'Material Issue / Return', path: '/beta/mfg/issue', perm: 'jobSheets' }, { label: 'Planning (MRP)', path: '/beta/mfg/mrp', perm: 'mfgOrders' },
      { label: 'QC Inspection', path: '/beta/mfg/qc', perm: 'jobSheets' }, { label: 'Production Cost', path: '/beta/mfg/cost', perm: 'mfgOrders' },
    ] },
  { key: 'stock', label: 'Stock', icon: 'box', perms: ['stock', 'items'],
    sub: [
      { label: 'Stock Items', path: '/beta/items', perm: 'items' },
      { label: 'Material — where lying', path: '/beta/stock', perm: 'stock' },
      { label: 'Raw Material Stock', path: '/beta/raw-stock', perm: 'stock' },
    ] },
  { key: 'acc', label: 'Account', icon: 'ledger', perms: ['accPayment', 'accReceipt', 'accJournal', 'accDebitNote', 'accCreditNote', 'accExpense'],
    sub: [
      { label: 'Payment', path: '/beta/account/payment', perm: 'accPayment' }, { label: 'Receipt', path: '/beta/account/receipt', perm: 'accReceipt' },
      { label: 'Journal', path: '/beta/account/journal', perm: 'accJournal' }, { label: 'Debit Note', path: '/beta/account/debit-note', perm: 'accDebitNote' },
      { label: 'Credit Note', path: '/beta/account/credit-note', perm: 'accCreditNote' }, { label: 'Expense', path: '/beta/account/expense', perm: 'accExpense' },
    ] },
  { key: 'books', label: 'Books & Reports', icon: 'chart', perms: ['accLedger', 'accReports', 'accBank', 'accDues', 'gst', 'accAsset'],
    sub: [
      { label: 'Ledger', path: '/beta/books/ledger', perm: 'accLedger' }, { label: 'Chart of Accounts', path: '/beta/books/chart', perm: 'accLedger' },
      { label: 'Trial Balance', path: '/beta/books/trial', perm: 'accReports' }, { label: 'Profit & Loss', path: '/beta/books/pl', perm: 'accReports' },
      { label: 'Balance Sheet', path: '/beta/books/bs', perm: 'accReports' }, { label: 'Cash / Bank Book', path: '/beta/books/cash', perm: 'accBank' },
      { label: 'GST Returns', path: '/beta/books/gst', perm: 'gst' }, { label: 'GST — As per Portal', path: '/beta/books/gst-portal', perm: 'gst' }, { label: 'TDS', path: '/beta/books/tds', perm: 'accReports' },
      { label: 'Ageing', path: '/beta/books/ageing', perm: 'accDues' }, { label: 'Fixed Assets', path: '/beta/books/assets', perm: 'accAsset' },
    ] },
  { key: 'hr', label: 'HR', icon: 'users', perm: 'hr',
    sub: [
      { label: 'Employees', path: '/beta/hr/employees' }, { label: 'Company Assets', path: '/beta/hr/assets' },
      { label: 'Attendance', path: '/beta/hr/attendance' }, { label: 'Payroll', path: '/beta/hr/payroll' }, { label: 'HR Policy', path: '/beta/hr/policy' },
    ] },
  { key: 'ins', label: 'Insurance', icon: 'shield', perm: 'insurance',
    sub: [
      { label: 'Policies', path: '/beta/insurance/policies' }, { label: 'Claims', path: '/beta/insurance/claims' },
    ] },
  { key: 'pm', label: 'Password Manager', icon: 'lock', perm: 'passwords', path: '/beta/passwords' },
  /* Admin: each page shows only to those allowed (perm 'admin' = admin role only) */
  { key: 'admin', label: 'Admin', icon: 'shield', perms: ['approvals', 'admin', 'userMgmt'],
    sub: [
      { label: 'Approvals', path: '/beta/admin/approvals', perm: 'approvals' },
      { label: 'Company', path: '/beta/admin/company', perm: 'admin' },
      { label: 'Users', path: '/beta/admin/users', perm: 'userMgmt' },
    ] },
];
const allowed = (user, perm) => (perm === 'admin' ? user?.role === 'admin' : perm === 'insurance' ? insCan(user, 'view') : perm === 'hr' ? hrCan(user, 'view') : can(user, perm, 'view'));

const initials = s => (s || '').replace(/^M\/s\.?\s*/i, '').split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'U';

const CSS = `
.bx { display:flex; height:100vh; height:calc(100vh / var(--ui-zoom, 1)); overflow:hidden; font-family:${F}; background:#F5F7FA; -webkit-font-smoothing:antialiased; }
.bx * { box-sizing:border-box; }

/* side nav — brand teal #03444f; each module's icon has its own colour (NAV_COLOR) */
.bx-side { width:188px; flex-shrink:0; display:flex; flex-direction:column; background:#03444f; border-right:1px solid #023840; }
.bx-brand { height:40px; flex-shrink:0; display:flex; align-items:center; gap:7px; padding:0 12px; background:#023a43; border-bottom:1px solid rgba(255,255,255,.08); text-decoration:none; }
.bx-mark { width:20px; height:20px; flex-shrink:0; border-radius:4px; display:grid; place-items:center; color:#fff; font-weight:800; font-size:11px; background:#fff; color:#03444f; }
.bx-nav { flex:1; overflow-y:auto; padding:10px 8px; scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.18) transparent; }
.bx-g { text-decoration:none; display:flex; align-items:center; gap:9px; width:100%; height:36px; padding:0 9px; border:1px solid rgba(255,255,255,.1); border-radius:7px; cursor:pointer;
  background:rgba(255,255,255,.06); color:#E8F3F4; font:600 12.5px ${F}; text-align:left; transition:background .15s, border-color .15s; }
.bx-g:hover { background:rgba(255,255,255,.12); border-color:rgba(255,255,255,.18); }
.bx-g.on { background:#fff; color:#03444f; border-color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.18); }
.bx-g .ico { width:24px; height:24px; flex-shrink:0; border-radius:7px; display:grid; place-items:center; color:#fff;
  background:var(--c, rgba(255,255,255,.12)); background-image:linear-gradient(145deg, rgba(255,255,255,.28), rgba(255,255,255,0) 55%, rgba(0,0,0,.12));
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.18), 0 1px 3px rgba(0,0,0,.25); }
.bx-g:hover .ico { filter:brightness(1.08) saturate(1.1); }
.bx-g.on .ico { box-shadow:0 2px 6px rgba(0,0,0,.18); }
.bx-g .lbl { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bx-nav > div + div { margin-top:6px; }
.bx-g .chev { display:grid; opacity:.7; transition:transform .15s; }
.bx-g.open .chev { transform:rotate(90deg); }
.bx-sub { margin:5px 0 8px 12px; display:flex; flex-direction:column; gap:4px; }
.bx-i { display:block; width:100%; height:28px; padding:0 10px; border:1px solid rgba(255,255,255,.12); border-radius:6px; background:rgba(255,255,255,.07);
  cursor:pointer; text-align:left; font:500 12px ${F}; color:#E0EEEF; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  box-shadow:0 1px 2px rgba(0,0,0,.15); transition:background .15s, border-color .15s; }
.bx-i:hover { background:rgba(255,255,255,.15); border-color:rgba(255,255,255,.24); color:#fff; }
.bx-i.cur { background:#fff; border-color:#fff; color:#03444f; font-weight:600; }
.bx-i:active { background:rgba(255,255,255,.2); box-shadow:none; }
.bx-brand b { font-size:12px; font-weight:700; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* top bar — brand teal #03444f, 40px, one-line controls */
.bx-main { flex:1; min-width:0; display:flex; flex-direction:column; }
/* beta scrollbars: teal, not the browser blue/grey */
.bx-main * { scrollbar-width:thin; scrollbar-color:#7FA9AF #E3EEEF; }
.bx-main *::-webkit-scrollbar { width:10px; height:10px; }
.bx-main *::-webkit-scrollbar-track { background:#E3EEEF; }
.bx-main *::-webkit-scrollbar-thumb { background:#7FA9AF; border-radius:6px; border:2px solid #E3EEEF; }
.bx-main *::-webkit-scrollbar-thumb:hover { background:#03444f; }
.bx-main *::-webkit-scrollbar-corner { background:#E3EEEF; }
.bx-top { height:40px; flex-shrink:0; display:flex; align-items:center; gap:6px; padding:0 8px; position:relative; z-index:20;
  background:#03444f; border-bottom:1px solid #023840; color:#fff; }
.bx-grow { flex:1; min-width:0; }

.bx-mc { position:relative; display:flex; align-items:center; height:28px; border:1px solid rgba(255,255,255,.22); border-radius:6px; background:rgba(255,255,255,.08); overflow:visible; }
.bx-mc .lb { height:100%; display:grid; place-items:center; padding:0 8px; background:rgba(255,255,255,.14); color:#fff; font:700 10.5px ${F}; letter-spacing:.6px; text-transform:uppercase; border-radius:5px 0 0 5px; }
.bx-mc input { width:104px; height:100%; border:0; outline:none; background:transparent; color:#fff; padding:0 8px; font:700 12.5px ui-monospace, 'SF Mono', Menlo, Consolas, monospace; letter-spacing:1.2px; text-transform:uppercase; }
.bx-mc input::placeholder { color:rgba(255,255,255,.55); font:500 12px ${F}; letter-spacing:0; text-transform:none; }
.bx-mc:focus-within { background:#fff; border-color:#fff; } .bx-mc:focus-within input { color:#03444f; } .bx-mc:focus-within input::placeholder { color:#98A2B3; }
.bx-mc:focus-within .lb { background:#03444f; }
.bx-mc .go, .bx-mc .hl { height:100%; width:26px; border:0; border-left:1px solid rgba(255,255,255,.18); background:transparent; color:#fff; display:grid; place-items:center; cursor:pointer; font:700 12px ${F}; }
.bx-mc:focus-within .go, .bx-mc:focus-within .hl { color:#03444f; border-left-color:#E4E7EC; }
.bx-mc .go:disabled { opacity:.45; cursor:default; } .bx-mc .hl { border-radius:0 5px 5px 0; }
.bx-mc .go:hover:not(:disabled), .bx-mc .hl:hover { background:rgba(255,255,255,.14); } .bx-mc:focus-within .go:hover:not(:disabled), .bx-mc:focus-within .hl:hover { background:#F2F4F7; }
.bx-mc .bx-res { right:auto; width:380px; top:31px; }
.bx-res .pg { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-res code { min-width:46px; padding:2px 6px; border-radius:4px; background:var(--c); color:#fff; font:700 11px ui-monospace, Menlo, Consolas, monospace; letter-spacing:.6px; text-align:center; }
.bx-res .pg { font-weight:600; }
.bx-res .ft { display:flex; gap:12px; padding:6px 9px 3px; margin-top:4px; border-top:1px solid #F2F4F7; font-size:10.5px; color:#98A2B3; }
.bx-cl-ov { position:fixed; inset:0; z-index:9500; background:rgba(16,24,40,.5); display:flex; align-items:flex-start; justify-content:center; padding-top:7vh; }
.bx-cl { width:min(860px, 94vw); max-height:84vh; background:#fff; border-radius:10px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 20px 50px rgba(0,0,0,.35); font-family:${F}; }
.bx-cl .h { display:flex; align-items:center; gap:10px; padding:12px 14px; background:#03444f; color:#fff; flex-wrap:wrap; }
.bx-cl .h b { font-size:14.5px; } .bx-cl .h small { flex:1; color:#BFE3E8; font-size:12px; } .bx-cl .h small b { font-size:12px; }
.bx-cl .h input { width:220px; height:30px; border:0; border-radius:6px; padding:0 10px; font:13px ${F}; outline:none; }
.bx-cl .h button { border:0; background:none; color:#fff; font-size:22px; cursor:pointer; padding:0 4px; }
.bx-cl .b { flex:1; overflow:auto; padding:12px 14px; columns:3 240px; column-gap:16px; }
.bx-cl .g { break-inside:avoid; margin-bottom:12px; }
.bx-cl .gh { display:flex; align-items:center; gap:7px; font-size:11.5px; font-weight:700; color:#344054; text-transform:uppercase; letter-spacing:.4px; margin-bottom:4px; }
.bx-cl .gh i { width:10px; height:10px; border-radius:3px; }
.bx-cl .g button { display:flex; align-items:center; gap:10px; width:100%; border:0; background:none; padding:5px 6px; border-radius:6px; cursor:pointer; text-align:left; font:13px ${F}; color:#101828; }
.bx-cl .g button:hover { background:#EEF6F7; }
.bx-cl code { min-width:52px; padding:2px 6px; border-radius:4px; background:#F2F5F6; color:#03444f; font:700 11.5px ui-monospace, Menlo, Consolas, monospace; letter-spacing:.6px; text-align:center; border:1px solid #DCE6E8; }
.bx-cl .none { color:#667085; padding:12px; }
.bx-res { position:absolute; left:0; right:0; top:32px; z-index:50; padding:4px; border-radius:6px; background:#fff; border:1px solid #D0D5DD;
  box-shadow:0 10px 28px rgba(16,24,40,.18); max-height:360px; overflow-y:auto; }
.bx-res a { display:flex; align-items:center; gap:10px; padding:6px 9px; border-radius:4px; text-decoration:none; color:#101828; font-size:12.5px; }
.bx-res a small { margin-left:auto; color:#98A2B3; font-size:11px; white-space:nowrap; }
.bx-res a.sel, .bx-res a:hover { background:#E6F2F3; }
.bx-res .none { padding:10px 9px; font-size:12.5px; color:#667085; }

.bx-dd { position:relative; flex-shrink:0; }
.bx-btn { display:flex; align-items:center; gap:6px; height:30px; padding:0 6px 0 4px; border:1px solid transparent; border-radius:4px; background:none; cursor:pointer;
  font:inherit; color:#fff; text-align:left; }
.bx-btn:hover, .bx-btn[aria-expanded="true"] { background:rgba(255,255,255,.12); }
.bx-btn.co { border-color:rgba(255,255,255,.2); background:rgba(255,255,255,.06); max-width:260px; }
.bx-btn b { display:block; font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-btn .nm { min-width:0; display:flex; align-items:baseline; gap:6px; }
.bx-btn small { font-size:10.5px; color:rgba(255,255,255,.65); text-transform:capitalize; white-space:nowrap; }
.bx-btn .cv { color:rgba(255,255,255,.6); display:grid; flex-shrink:0; }
.bx-co-av { width:22px; height:22px; flex-shrink:0; border-radius:4px; display:grid; place-items:center; font-size:9.5px; font-weight:700; color:#03444f; background:#D6ECEE; }
.bx-av { width:22px; height:22px; flex-shrink:0; border-radius:50%; display:grid; place-items:center; font-size:9.5px; font-weight:700; color:#fff; background:#fff; color:#03444f; position:relative; }
.bx-av .dot, .bx-mi .cnt { min-width:16px; height:16px; padding:0 4px; border-radius:99px; background:#D92D20; color:#fff; font-size:9.5px; font-weight:700; line-height:16px; text-align:center; }
.bx-av .dot { position:absolute; top:-6px; right:-8px; border:1.5px solid #03444f; box-sizing:content-box; height:13px; line-height:13px; min-width:13px; padding:0 3px; }
.bx-mi .cnt { margin-left:auto; }

.bx-pop { position:absolute; right:0; top:34px; z-index:60; min-width:210px; padding:4px; border-radius:6px; background:#fff; border:1px solid #D0D5DD;
  box-shadow:0 10px 28px rgba(16,24,40,.18); }
.bx-pop .hd { padding:7px 9px 6px; border-bottom:1px solid #F2F4F7; margin-bottom:3px; }
.bx-pop .hd b { display:block; font-size:12.5px; color:#101828; }
.bx-pop .hd small { display:block; font-size:11px; color:#667085; margin-top:1px; word-break:break-all; }
.bx-mi { display:flex; align-items:center; gap:9px; width:100%; padding:6px 9px; border:none; border-radius:4px; background:none; cursor:pointer;
  font:400 12.5px ${F}; color:#344054; text-align:left; text-decoration:none; }
.bx-mi:hover { background:#E6F2F3; color:#101828; }
.bx-mi .ico { color:#667085; display:grid; }
.bx-mi.danger { color:#B42318; }
.bx-mi.danger .ico { color:#D92D20; }
.bx-sep { height:1px; background:#F2F4F7; margin:3px 0; }

.bx-body { flex:1; min-height:0; display:flex; flex-direction:column; }
.bx-body > .content-area { flex:1; }

@media (max-width: 900px) {
  .bx-side { width:44px; }
  .bx-brand { padding:0 12px; }
  .bx-nav { padding:8px 4px; }
  .bx-g { justify-content:center; padding:0; }
  .bx-g .lbl, .bx-g .chev, .bx-sub { display:none; }
  .bx-brand b, .bx-btn .nm, .bx-btn .cv { display:none; }
  .bx-top { padding:0 6px; gap:4px; }
  .bx-mc input { width:70px; }
}
`;

/* close a popup on outside click / Escape */
function useOutside(open, close, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const down = e => { if (!ref.current?.contains(e.target)) close(); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps
}

export default function BetaShell() {
  const { user, logout } = useAuth();
  const { companies = [], selectedCompany, selectCompany } = useCompany() || {};
  const chat = useChat();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const [menu, setMenu] = useState(null);   // 'co' | 'me'
  const sideNav = useMemo(() => SIDE_NAV.filter(n => (n.perms ? n.perms.some(p => allowed(user, p)) : allowed(user, n.perm)))
    .map(n => (n.sub ? { ...n, sub: n.sub.filter(x => !x.perm || allowed(user, x.perm)) } : n)), [user]);
  const [openNav, setOpenNav] = useState({});   // the one side nav button whose sub menu is open (opening one closes the others)
  const inSub = (n, p) => (n.sub || []).some(x => x.path && (p === x.path || p.startsWith(x.path + '/')));
  useEffect(() => { SIDE_NAV.forEach(n => { if (inSub(n, pathname)) setOpenNav({ [n.key]: true }); }); }, [pathname]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState('');
  const [qOpen, setQOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const searchRef = useRef(null), searchBox = useRef(null), coRef = useRef(null), meRef = useRef(null);

  useEffect(() => { setMenu(null); setQOpen(false); }, [pathname, search]);
  useOutside(menu === 'co', () => setMenu(null), coRef);
  useOutside(menu === 'me', () => setMenu(null), meRef);
  useOutside(qOpen, () => setQOpen(false), searchBox);

  /* menu shortcuts: every beta page this user may open, with its code */
  const allItems = useMemo(() => {
    const out = [], seen = new Set();
    const add = it => { if (!it.path || seen.has(it.path)) return; seen.add(it.path); out.push({ ...it, code: SHORTCUTS[it.path] || '' }); };
    sideNav.forEach(n => { if (n.path && !n.sub) add({ label: n.label, path: n.path, group: n.label, key: n.key }); (n.sub || []).forEach(x => add({ label: x.label, path: x.path, group: n.label, key: n.key })); });
    EXTRA_PAGES.filter(x => !x.perm || allowed(user, x.perm)).forEach(add);
    return out;
  }, [sideNav, user]);
  /* a code typed: the exact code first, then codes that start with it, then page names that contain the words */
  const results = useMemo(() => {
    const t = q.trim().toUpperCase();
    if (!t) return [];
    const words = t.toLowerCase().split(/\s+/).filter(Boolean);
    const score = it => (it.code === t ? 0 : it.code.startsWith(t) ? 1 : words.every(w => `${it.label} ${it.group}`.toLowerCase().includes(w)) ? 2 : 9);
    return allItems.map(it => [score(it), it]).filter(([sc]) => sc < 9).sort((a, b) => a[0] - b[0] || a[1].code.length - b[1].code.length).slice(0, 10).map(([, it]) => it);
  }, [q, allItems]);
  const [codeList, setCodeList] = useState(false);
  const [listQ, setListQ] = useState('');
  useEffect(() => setSel(0), [q]);
  const go = path => { setQ(''); setQOpen(false); searchRef.current?.blur(); navigate(path); };
  const onSearchKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { if (results[sel]) go(results[sel].path); }
    else if (e.key === 'Escape') { setQ(''); setQOpen(false); searchRef.current?.blur(); }
  };

  /* keys: Ctrl+K or F2 = menu shortcut box, F1 = list of all shortcuts, V = vouchers (last used voucher screen, like Tally) */
  const onTxn = isTransactionPath(pathname);
  useEffect(() => { if (onTxn) try { localStorage.setItem(LAST_VOUCHER_KEY, pathname); } catch { /* ignore */ } }, [onTxn, pathname]);
  useEffect(() => {
    const k = e => {
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); setQOpen(true); return; }
      if (e.key === 'F1') { e.preventDefault(); setCodeList(true); return; }
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.repeat || onTxn) return;
      if (typing(e.target) || typing(document.activeElement) || document.querySelector('.ls-overlay')) return;
      if (e.key !== 'v' && e.key !== 'V') return;
      let p = null; try { p = localStorage.getItem(LAST_VOUCHER_KEY); } catch { /* ignore */ }
      e.preventDefault();
      navigate(p && isTransactionPath(p) ? p : VOUCHERS[0].path);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onTxn, navigate]);

  const signOut = async () => { setMenu(null); try { await logout(); } finally { navigate('/beta/login', { replace: true }); } };
  const openChat = () => { setMenu(null); chat?.openPanel?.(); };

  const coName = selectedCompany?.companyName || 'Select company';
  const userName = user?.name || user?.username || 'User';
  const chatUnread = chat?.total || 0;

  return (
    <div className="bx">
      <style>{CSS}</style>

      <aside className="bx-side" aria-label="Side navigation">
        <Link to="/dashboard" className="bx-brand" title={PRODUCT_NAME}>
          <span className="bx-mark">S</span><b>{PRODUCT_NAME}</b>
        </Link>

        <nav className="bx-nav" aria-label="Main menu">
          {sideNav.map(n => {
            const open = !!openNav[n.key];
            return (
              <div key={n.key}>
                <button type="button" className={`bx-g${open ? ' open' : ''}${n.path && pathname.startsWith(n.path) ? ' on' : ''}`} title={n.label} aria-expanded={n.sub ? open : undefined}
                  onClick={() => (n.path && !n.sub ? navigate(n.path) : setOpenNav(o => (o[n.key] ? {} : { [n.key]: true })))}>
                  <span className="ico" style={{ '--c': NAV_COLOR[n.key] }}><Svg name={n.icon} size={14} /></span>
                  <span className="lbl">{n.label}</span>
                  {n.sub && <span className="chev"><Svg name="chevRight" size={13} /></span>}
                </button>
                {open && n.sub && (
                  <div className="bx-sub">
                    {n.sub.map(x => <button key={x.label} type="button" className={`bx-i${x.path && pathname.startsWith(x.path) ? ' cur' : ''}`} onClick={() => x.path && navigate(x.path)}>{x.label}</button>)}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="bx-main">
        <header className="bx-top">
          <div className="bx-grow" />

          {/* menu shortcut — Finacle style: type a code (SO, SINV, GST…) and press Enter */}
          <div className="bx-mc" ref={searchBox}>
            <span className="lb">Menu</span>
            <input ref={searchRef} value={q} placeholder="Shortcut" aria-label="Menu shortcut — type a code like SO, PO, GST and press Enter" spellCheck={false} autoComplete="off"
              onChange={e => { setQ(e.target.value.toUpperCase()); setQOpen(true); }} onFocus={() => setQOpen(true)} onKeyDown={onSearchKey} />
            <button type="button" className="go" title="Open" onClick={() => results[sel] && go(results[sel].path)} disabled={!results.length}><Svg name="arrow" size={13} /></button>
            <button type="button" className="hl" title="All shortcuts (F1)" onClick={() => { setQOpen(false); setCodeList(true); }}>?</button>
            {qOpen && q.trim() && (
              <div className="bx-res" role="listbox">
                {results.length ? results.map((r, i) => (
                  <a key={r.path} href={r.path} className={i === sel ? 'sel' : ''} role="option" aria-selected={i === sel}
                    onMouseEnter={() => setSel(i)} onClick={e => { e.preventDefault(); go(r.path); }}>
                    <code style={{ '--c': NAV_COLOR[r.key] || '#03444f' }}>{r.code || '—'}</code><span className="pg">{r.label}</span><small>{r.group}</small>
                  </a>
                )) : <div className="none">No shortcut “{q}”. Press <b>F1</b> for the list.</div>}
                <div className="ft"><span>↑↓ move</span><span>↵ open</span><span>F1 all shortcuts</span><span>Esc close</span></div>
              </div>
            )}
          </div>

          <div className="bx-grow" />

          {/* active company */}
          <div className="bx-dd" ref={coRef}>
            <button type="button" className="bx-btn co" onClick={() => setMenu(m => (m === 'co' ? null : 'co'))} title={coName} aria-haspopup="listbox" aria-expanded={menu === 'co'}>
              <span className="bx-co-av">{initials(coName)}</span>
              <span className="nm"><b>{coName}</b><small>Active company</small></span>
              <span className="cv"><Svg name="chevDown" size={13} /></span>
            </button>
            {menu === 'co' && (
              <div className="bx-pop" role="listbox" style={{ width: 280 }}>
                <div className="hd"><b>Companies</b><small>{companies.length} available</small></div>
                {companies.map(c => {
                  const on = c.companyId === selectedCompany?.companyId;
                  return (
                    <button key={c.companyId} type="button" role="option" aria-selected={on} className="bx-mi"
                      onClick={() => { setMenu(null); if (!on) selectCompany(c); }}>
                      <span className="bx-co-av" style={{ width: 24, height: 24, fontSize: 10 }}>{initials(c.companyName)}</span>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: on ? 600 : 400 }}>{c.companyName}</span>
                      {on && <span style={{ color: '#03444f', display: 'grid' }}><Svg name="check" size={16} stroke={2.2} /></span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* profile — last */}
          <div className="bx-dd" ref={meRef}>
            <button type="button" className="bx-btn" onClick={() => setMenu(m => (m === 'me' ? null : 'me'))} aria-haspopup="menu" aria-expanded={menu === 'me'} aria-label="Profile">
              <span className="bx-av">{initials(userName)}{chatUnread > 0 && <span className="dot">{chatUnread > 99 ? '99+' : chatUnread}</span>}</span>
              <span className="nm"><b>{userName}</b><small>{user?.role || 'user'}</small></span>
              <span className="cv"><Svg name="chevDown" size={13} /></span>
            </button>
            {menu === 'me' && (
              <div className="bx-pop" role="menu">
                <div className="hd"><b>{userName}</b><small>{user?.email || user?.username}</small></div>
                <Link to="/beta/profile" className="bx-mi" role="menuitem" onClick={() => setMenu(null)}><span className="ico"><Svg name="settings" size={16} /></span>Profile settings</Link>
                <button type="button" className="bx-mi" role="menuitem" onClick={openChat}>
                  <span className="ico"><Svg name="mail" size={16} /></span>Chat
                  {chatUnread > 0 && <span className="cnt">{chatUnread > 99 ? '99+' : chatUnread}</span>}
                </button>
                <div className="bx-sep" />
                <button type="button" className="bx-mi danger" role="menuitem" onClick={signOut}><span className="ico"><Svg name="logout" size={16} /></span>Logout</button>
              </div>
            )}
          </div>
        </header>

        {codeList && (() => {
          const w = listQ.trim().toLowerCase();
          const groups = [];
          allItems.filter(it => !w || `${it.code} ${it.label} ${it.group}`.toLowerCase().includes(w)).forEach(it => { let g = groups.find(x => x.name === it.group); if (!g) groups.push(g = { name: it.group, key: it.key, items: [] }); g.items.push(it); });
          return (
            <div className="bx-cl-ov" onMouseDown={e => { if (e.target === e.currentTarget) setCodeList(false); }} onKeyDown={e => { if (e.key === 'Escape') setCodeList(false); }}>
              <div className="bx-cl" role="dialog" aria-modal="true" aria-label="Menu shortcuts">
                <div className="h"><b>Menu shortcuts</b><small>Type a code in the <b>Menu</b> box (Ctrl+K or F2) and press Enter</small>
                  <input autoFocus value={listQ} onChange={e => setListQ(e.target.value)} placeholder="Find a page or code…" aria-label="Find a shortcut" />
                  <button type="button" onClick={() => setCodeList(false)} aria-label="Close">×</button></div>
                <div className="b">{groups.map(g => (
                  <div key={g.name} className="g"><div className="gh"><i style={{ background: NAV_COLOR[g.key] || '#03444f' }} />{g.name}</div>
                    {g.items.map(it => <button key={it.path} type="button" onClick={() => { setCodeList(false); setListQ(''); navigate(it.path); }}><code>{it.code || '—'}</code><span>{it.label}</span></button>)}
                  </div>))}
                  {!groups.length && <div className="none">Nothing matches “{listQ}”.</div>}
                </div>
              </div>
            </div>);
        })()}
        <div className="bx-body">
          {(pathname === '/dashboard' || pathname === '/beta' || pathname === '/beta/') && <BetaDashboard key={`dash-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/client') && <BetaClients key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/order') && <BetaOrders key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/proforma') && <BetaProforma key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/receipt') && <BetaReceipt key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/dues') && <BetaDues key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/sales') && <BetaSales key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/delivery-challan') && <BetaDC key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/passwords') && <BetaPasswords key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/vendor') && <BetaVendors key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/po') && <BetaPO key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/payment') && <BetaPayment key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/purchase-dues') && <BetaPurchaseDues key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/purchase-bill') && <BetaPurchaseBill key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/grn') && <BetaGRN key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/return-note') && <BetaReturns kind="client" key={`rn-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/return-vendor') && <BetaReturns kind="vendor" key={`rv-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/stock') && <BetaStock key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/raw-stock') && <RawStock key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/items') && <BetaItems key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/warranty') && <BetaWarranty key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/completion') && <BetaCompletion key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/profile') && <BetaProfile />}
          {pathname.startsWith('/beta/account/payment') && <BetaAccPayment key={`ap-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/account/receipt') && <BetaReceipt base="/beta/account/receipt" key={`ar-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/account/journal') && <BetaJournal key={`aj-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/account/debit-note') && <BetaNotes kind="debit" key={`dn-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/account/credit-note') && <BetaNotes kind="credit" key={`cn-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/account/expense') && <BetaExpense key={`ae-${selectedCompany?.companyId || 'none'}`} />}
          {['ledger', 'chart', 'trial', 'pl', 'bs', 'cash', 'tds', 'ageing'].map(v => pathname.startsWith(`/beta/books/${v}`) && <BetaBooks key={`bk-${v}-${selectedCompany?.companyId || 'none'}`} view={v} />)}
          {pathname.startsWith('/beta/books/gst-portal') && <BetaGstPortal key={`gsp-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/books/gst') && !pathname.startsWith('/beta/books/gst-portal') && <BetaGstReturns key={`gst-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/books/assets') && <BetaFixedAssets key={`fa-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/hr/employees') && <BetaHREmployees key={`he-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/hr/assets') && <BetaHRAssets key={`ha-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/hr/attendance') && <BetaHRAttendance key={`hat-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/hr/payroll') && <BetaHRPayroll key={`hp-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/hr/policy') && <BetaHRPolicy key={`hpo-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/insurance/policies') && <BetaInsurance view="policies" key={`ip-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/insurance/claims') && <BetaInsurance view="claims" key={`ic-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/bank-guarantee') && <BetaBG key={selectedCompany?.companyId || 'none'} />}
          {pathname.startsWith('/beta/jobcode') && <BetaJobcode key={`jc-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/mfg/job-sheet') && <BetaJobSheet key={`js-${selectedCompany?.companyId || 'none'}`} />}
          {pathname.startsWith('/beta/mfg/raw-material') && <BetaRawMaterial key={selectedCompany?.companyId || 'none'} />}
          {['bom', 'issue', 'mrp', 'qc', 'cost'].map(v => pathname.startsWith(`/beta/mfg/${v}`) && <BetaMfg key={`mfg-${v}-${selectedCompany?.companyId || 'none'}`} view={v} />)}
          {pathname.startsWith('/beta/admin/') && (
            <div style={{ height: '100%', overflow: 'auto', padding: 16, background: '#fff' }}>
              {pathname.startsWith('/beta/admin/approvals') && (allowed(user, 'approvals') ? <ApprovalView /> : <p>You do not have access to Approvals.</p>)}
              {pathname.startsWith('/beta/admin/company') && (allowed(user, 'admin') ? <Companies /> : <p>Only an Admin can manage companies.</p>)}
              {pathname.startsWith('/beta/admin/users') && (allowed(user, 'userMgmt') ? <AdminUsers /> : <p>You do not have access to User Management.</p>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
