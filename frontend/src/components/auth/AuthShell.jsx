/* Shared layout for every sign-in page (login, forgot / reset / set password, supplier registration).
 * Enterprise style: full-height split — a navy brand panel (headline + all ERP modules) on the left,
 * a clean white form on the right. Line icons only, no emoji.
 * Pages put their form inside; the left panel text comes from props. */
import React, { useEffect, useRef, useState } from 'react';
import { PRODUCT_NAME, PRODUCT_VERSION, CLIENT_LOGO } from '../../utils/brand';
import { Svg } from '../ui/Icon';

export { Svg };

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/* Everything in the ERP — shown on the sign-in / registration panel. */
export const ERP_MODULES = [
  { icon: 'dashboard', name: 'Dashboard',     text: 'Live business overview' },
  { icon: 'folder',    name: 'Jobcode',       text: 'Projects & order files' },
  { icon: 'users',     name: 'CRM & Sales',   text: 'Clients, leads, orders, invoices' },
  { icon: 'cart',      name: 'Purchase',      text: 'Vendors, POs, purchase bills' },
  { icon: 'box',       name: 'Inventory',     text: 'Items & stock' },
  { icon: 'factory',   name: 'Manufacturing', text: 'Production & quality' },
  { icon: 'swap',      name: 'Transactions',  text: 'Payments, receipts, journals' },
  { icon: 'ledger',    name: 'Accounts',      text: 'Ledgers, dues, statements' },
  { icon: 'sync',      name: 'Tally Sync',    text: 'Reconciliation with Tally' },
  { icon: 'badge',     name: 'HR & Payroll',  text: 'Recruitment to salary' },
  { icon: 'chart',     name: 'Reports',       text: 'Order profit, GST, MIS' },
  { icon: 'store',     name: 'Supplier Portal', text: 'Supplier self-service' },
  { icon: 'shield',    name: 'Administration', text: 'Users, roles, companies' },
  { icon: 'spark',     name: 'AI Assistant',  text: 'Ask questions of your data' },
];

/* Where "Back to sign in" goes: the login the person is using (new or classic). */
export const loginPath = () => {
  try { return localStorage.getItem('ui-version') === 'beta' ? '/beta/login' : '/login'; } catch { return '/login'; }
};

const NAVY = '#03444f';   // beta teal (same as the app's side bar / buttons)
const BLUE = '#03444f';

const CSS = `
.as { min-height:100vh; min-height:calc(100vh / var(--ui-zoom, 1)); display:grid; grid-template-columns:minmax(0, 1.15fr) minmax(0, 1fr);
  font-family:${F}; color:#101828; background:#fff; -webkit-font-smoothing:antialiased; }
.as.wide { grid-template-columns:minmax(0, .8fr) minmax(0, 1.2fr); }
.as * { box-sizing:border-box; }
@keyframes as-in   { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
@keyframes as-spin { to { transform:rotate(360deg) } }
@keyframes as-shake { 20%,60% { transform:translateX(-5px) } 40%,80% { transform:translateX(5px) } }

/* ── left: brand panel ── */
.as-left { position:relative; overflow:hidden; color:#fff; display:flex; flex-direction:column; padding:36px 56px 28px;
  background:
    radial-gradient(700px 460px at 92% 8%, rgba(42,157,170,.45), transparent 62%),
    radial-gradient(620px 520px at -8% 105%, rgba(94,184,196,.22), transparent 60%),
    linear-gradient(155deg, #04505C 0%, #03444f 38%, #022F37 78%, #01242A 100%); }
.as-left::before { content:''; position:absolute; inset:0; pointer-events:none;
  background-image:radial-gradient(rgba(255,255,255,.09) 1px, transparent 1px); background-size:22px 22px;
  mask-image:radial-gradient(ellipse at 70% 40%, #000 0%, rgba(0,0,0,.5) 45%, transparent 80%); }
.as-left > * { position:relative; }
.as-brand { display:flex; align-items:center; gap:12px; }
.as-mark { width:38px; height:38px; border-radius:10px; display:grid; place-items:center; font-weight:800; font-size:17px; color:#fff;
  background:linear-gradient(135deg, #2FB3C0, #0B5F6B); box-shadow:0 8px 18px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.3); }
.as-brand b { display:block; font-size:15.5px; font-weight:700; letter-spacing:.1px; }
.as-brand small { display:block; font-size:11px; color:#9FC3C8; letter-spacing:.3px; margin-top:1px; }
.as-hero { flex:1; display:flex; flex-direction:column; justify-content:center; padding:28px 0 18px; max-width:640px; }
.as-kicker { align-self:flex-start; display:inline-flex; align-items:center; gap:8px; font-size:11.5px; font-weight:600; letter-spacing:.4px; color:#CFEFF2;
  padding:5px 12px 5px 8px; border-radius:99px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.14); }
.as-kicker i { width:7px; height:7px; border-radius:50%; background:#32D583; box-shadow:0 0 0 3px rgba(50,213,131,.22); }
.as-left h1 { margin:16px 0 0; font-size:38px; line-height:1.12; font-weight:800; letter-spacing:-1px; max-width:580px; }
.as-left h1 em { font-style:normal; background:linear-gradient(90deg, #8FE3EC, #D4F3F6); -webkit-background-clip:text; background-clip:text; color:transparent; }
.as-left p { margin:14px 0 0; max-width:520px; font-size:14.5px; line-height:1.65; color:#B5D3D7; }
.as-points { list-style:none; margin:24px 0 0; padding:0; display:grid; gap:12px; }
.as-points li { display:flex; gap:12px; align-items:flex-start; font-size:13.5px; color:#DCEDEF; line-height:1.5; }
.as-points li span { width:22px; height:22px; flex-shrink:0; border-radius:6px; display:grid; place-items:center; color:#8FD3DC; background:rgba(94,184,196,.16); border:1px solid rgba(143,211,220,.28); }

/* product preview: a small dashboard window with floating cards */
.as-pv { position:relative; margin:30px 0 0; max-width:600px; padding:0 0 18px 0; }
.as-win { border-radius:14px; overflow:hidden; background:#fff; color:#101828; box-shadow:0 30px 60px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.08);
  transform:perspective(1400px) rotateY(-4deg) rotateX(2deg); transform-origin:left center; }
.as-win-bar { display:flex; align-items:center; gap:6px; height:30px; padding:0 12px; background:#03444f; }
.as-win-bar i { width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,.28); }
.as-win-bar span { margin-left:10px; font-size:10.5px; font-weight:600; color:#CFE7EA; letter-spacing:.3px; }
.as-win-body { display:grid; grid-template-columns:48px 1fr; min-height:200px; }
.as-win-nav { background:#F2F8F8; border-right:1px solid #E1EDEF; padding:10px 0; display:flex; flex-direction:column; align-items:center; gap:10px; color:#7E9A9E; }
.as-win-nav span { width:28px; height:28px; border-radius:7px; display:grid; place-items:center; }
.as-win-nav span.on { background:#D4EBEE; color:#03444f; }
.as-win-main { padding:12px 14px 14px; min-width:0; }
.as-kpis { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; }
.as-kpi { border:1px solid #E1EDEF; border-radius:9px; padding:8px 10px; min-width:0; }
.as-kpi small { display:block; font-size:9.5px; font-weight:600; letter-spacing:.4px; text-transform:uppercase; color:#7E9A9E; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.as-kpi b { display:block; margin-top:3px; font-size:15px; font-weight:800; color:#03444f; letter-spacing:-.2px; white-space:nowrap; }
.as-kpi em { font-style:normal; font-size:10px; font-weight:700; color:#079455; }
.as-chart { margin-top:10px; border:1px solid #E1EDEF; border-radius:9px; padding:8px 10px 6px; }
.as-chart-h { display:flex; justify-content:space-between; font-size:10px; font-weight:700; color:#344054; }
.as-chart-h span { display:flex; gap:10px; font-weight:600; color:#7E9A9E; }
.as-chart-h span i { display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:4px; vertical-align:-1px; }
.as-bars { display:flex; align-items:flex-end; gap:9px; height:74px; margin-top:6px; }
.as-bars div { flex:1; display:flex; align-items:flex-end; gap:2px; height:100%; }
.as-bars b { flex:1; border-radius:3px 3px 0 0; background:#03444f; animation:as-grow .9s cubic-bezier(.2,.8,.2,1) both; transform-origin:bottom; }
.as-bars b + b { background:#8FD3DC; }
@keyframes as-grow { from { transform:scaleY(0); } to { transform:none; } }
.as-float { position:absolute; display:flex; align-items:center; gap:10px; padding:10px 13px; border-radius:11px; background:#fff; color:#101828;
  box-shadow:0 16px 36px rgba(0,0,0,.28); font-size:11.5px; line-height:1.35; animation:as-float 6s ease-in-out infinite; }
.as-float > span { width:30px; height:30px; flex-shrink:0; border-radius:8px; display:grid; place-items:center; }
.as-float b { display:block; font-size:12px; font-weight:700; } .as-float small { display:block; color:#667085; font-size:10.5px; }
.as-float.f1 { right:-22px; top:-26px; } .as-float.f1 > span { background:#DCFAE6; color:#079455; }
.as-float.f2 { left:-22px; bottom:-4px; animation-delay:-3s; } .as-float.f2 > span { background:#D4EBEE; color:#03444f; }
@keyframes as-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }

.as-mods-h { display:flex; align-items:center; gap:10px; margin:30px 0 10px; font-size:11px; font-weight:600; letter-spacing:1.3px; text-transform:uppercase; color:#86AEB4; }
.as-mods-h::after { content:''; flex:1; height:1px; background:rgba(255,255,255,.1); }
.as-chips { display:flex; flex-wrap:wrap; gap:6px; max-width:620px; }
.as-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 10px 0 8px; border-radius:99px; font-size:11.5px; font-weight:600; color:#DCEDEF;
  background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.11); transition:background .15s, border-color .15s; }
.as-chip:hover { background:rgba(255,255,255,.12); border-color:rgba(143,211,220,.35); }
.as-chip svg { color:#8FD3DC; }
.as-meta { display:flex; flex-wrap:wrap; gap:8px 22px; font-size:11.5px; color:#86AEB4; padding-top:16px; border-top:1px solid rgba(255,255,255,.08); }
.as-meta span { display:inline-flex; align-items:center; gap:6px; }

/* ── right: form ── */
.as-right { display:flex; flex-direction:column; min-width:0; background:linear-gradient(180deg, #fff 0%, #fff 60%, #F4FAFA 100%); }
.as-top { display:flex; justify-content:flex-end; align-items:center; gap:14px; padding:22px 40px 0; min-height:56px; font-size:12.5px; color:#667085; }
.as-main { flex:1; display:flex; align-items:center; justify-content:center; padding:24px 40px; }
.as-form { width:100%; max-width:400px; animation:as-in .35s ease both; }
.as.wide .as-form { max-width:640px; }
.as-form.shake { animation:as-shake .4s ease; }
.as-logo { display:block; height:36px; max-width:230px; object-fit:contain; margin-bottom:32px; }
.as-title { margin:0; font-size:28px; font-weight:800; letter-spacing:-.6px; color:#0B2227; }
.as-sub { margin:6px 0 26px; font-size:14px; color:#667085; line-height:1.55; }
.as-bottom { display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:0 40px 22px; font-size:11.5px; color:#98A2B3; }

.as-tabs { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:4px; margin-bottom:24px; border-radius:9px; background:#EAF4F5; border:1px solid #D4EBEE; }
.as-tabs button { height:34px; border:none; border-radius:6px; background:transparent; cursor:pointer; font:600 13px ${F}; color:#667085;
  display:flex; align-items:center; justify-content:center; gap:7px; transition:background .15s, color .15s, box-shadow .15s; }
.as-tabs button:hover { color:#344054; }
.as-tabs button.on { background:${NAVY}; color:#fff; box-shadow:0 1px 2px rgba(16,24,40,.08), 0 1px 3px rgba(16,24,40,.1); }

.as-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 16px; }
.as-grid .full { grid-column:1 / -1; }
.as-lbl { display:block; font-size:13px; font-weight:600; color:#344054; margin:0 0 6px; }
.as-lbl em { color:#D92D20; font-style:normal; }
.as-field { position:relative; margin-bottom:18px; }
.as-field .ic { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#98A2B3; pointer-events:none; display:grid; place-items:center; }
.as-in { width:100%; height:46px; padding:0 14px; border:1px solid #C9D7DA; border-radius:9px; outline:none; background:#fff;
  font:400 14.5px ${F}; color:#101828; box-shadow:0 1px 2px rgba(16,24,40,.05); transition:border-color .15s, box-shadow .15s; }
.as-field .ic + .as-in { padding-left:40px; }
textarea.as-in { height:auto; min-height:76px; padding:11px 14px; resize:vertical; line-height:1.5; }
select.as-in { cursor:pointer; appearance:none; -webkit-appearance:none; padding-right:36px;
  background:#fff url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8'><path d='M1 1.5l5 5 5-5' fill='none' stroke='%23667085' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/></svg>") no-repeat right 14px center; }
.as-in::placeholder { color:#98A2B3; }
.as-in:hover { border-color:#A9C2C6; }
.as-in:focus { border-color:#2A9DAA; box-shadow:0 0 0 4px rgba(42,157,170,.16); }
.as-in.bad { border-color:#FDA29B; }
.as-in.bad:focus { box-shadow:0 0 0 4px rgba(217,45,32,.1); }
.as-show { position:absolute; right:4px; top:50%; transform:translateY(-50%); width:36px; height:36px; border:none; border-radius:6px; background:none;
  cursor:pointer; color:#667085; display:grid; place-items:center; }
.as-show:hover { background:#EAF4F5; color:#03444f; }
.as-hint { margin:-12px 0 16px; font-size:12.5px; color:#D92D20; }
.as-hint.ok { color:#067647; }
.as-hint.warn { color:#B54708; }

.as-row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:-4px 0 22px; font-size:13.5px; }
.as-check { display:flex; align-items:center; gap:8px; cursor:pointer; color:#344054; user-select:none; }
.as-check input { position:absolute; opacity:0; pointer-events:none; }
.as-check i { width:16px; height:16px; border-radius:4px; border:1px solid #D0D5DD; display:grid; place-items:center; color:#fff; font-style:normal; transition:all .12s; }
.as-check i::after { content:''; width:8px; height:4.5px; border-left:2px solid #fff; border-bottom:2px solid #fff; transform:rotate(-45deg) translate(1px,-1px); opacity:0; }
.as-check input:checked + i { background:${BLUE}; border-color:${BLUE}; }
.as-check input:checked + i::after { opacity:1; }
.as-check input:focus-visible + i { box-shadow:0 0 0 4px rgba(3,68,79,.15); }
.as-link { background:none; border:none; padding:0; cursor:pointer; font:600 13.5px ${F}; color:${BLUE}; }
.as-link:hover { color:#022F37; text-decoration:underline; }

.as-btn { width:100%; height:46px; border-radius:9px; cursor:pointer; font:700 14.5px ${F};
  display:flex; align-items:center; justify-content:center; gap:8px; transition:background .15s, box-shadow .15s, border-color .15s; }
.as-btn.pri { border:1px solid ${BLUE}; color:#fff; background:linear-gradient(180deg, #0B5F6B, ${BLUE}); box-shadow:0 6px 16px rgba(3,68,79,.25); transition:transform .12s, box-shadow .15s, background .15s; }
.as-btn.pri:hover:not(:disabled) { background:linear-gradient(180deg, #03444f, #022F37); transform:translateY(-1px); box-shadow:0 10px 22px rgba(3,68,79,.3); }
.as-btn.pri:focus-visible, .as-btn.out:focus-visible { outline:none; box-shadow:0 0 0 4px rgba(3,68,79,.2); }
.as-btn.ok  { border:1px solid #079455; color:#fff; background:#079455; }
.as-btn.out { border:1px solid #D0D5DD; color:#344054; background:#fff; box-shadow:0 1px 2px rgba(16,24,40,.05); }
.as-btn.out:hover:not(:disabled) { background:#F9FAFB; }
.as-btn.ghost { border:1px solid #EAECF0; color:#475467; background:#F9FAFB; }
.as-btn.ghost:hover:not(:disabled) { background:#F2F4F7; }
.as-btn:disabled { opacity:.6; cursor:not-allowed; }
.as-spin { width:16px; height:16px; border-radius:50%; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; animation:as-spin .6s linear infinite; }
.as-btns { display:flex; gap:12px; }
.as-btns .as-btn { flex:1; }

.as-or { display:flex; align-items:center; gap:12px; margin:20px 0; font-size:12.5px; color:#98A2B3; }
.as-or::before, .as-or::after { content:''; flex:1; height:1px; background:#EAECF0; }
.as-foot { margin-top:24px; text-align:center; font-size:13.5px; color:#667085; }
.as-foot .as-link { margin-left:5px; }
.as-notice { margin-top:28px; padding-top:16px; border-top:1px solid #F2F4F7; display:flex; gap:8px; align-items:flex-start; font-size:12px; line-height:1.5; color:#98A2B3; }

.as-alert { display:flex; gap:10px; align-items:flex-start; padding:11px 13px; margin-bottom:18px; border-radius:8px; font-size:13.5px; line-height:1.5; word-break:break-word; }
.as-alert svg { flex-shrink:0; margin-top:1px; }
.as-alert.error { background:#FEF3F2; color:#B42318; border:1px solid #FECDCA; }
.as-alert.success { background:#ECFDF3; color:#067647; border:1px solid #ABEFC6; }
.as-alert.info { background:#F0F7F8; color:#022F37; border:1px solid #D4EBEE; }

.as-title + .as-state, .as-sub + .as-state { margin-top:24px; }
.as-state { text-align:center; padding:4px 0; animation:as-in .3s ease both; }
.as-state .big { width:56px; height:56px; margin:0 auto 18px; border-radius:50%; display:grid; place-items:center; }
.as-state .big.ok { background:#DCFAE6; color:#079455; box-shadow:0 0 0 8px #ECFDF3; }
.as-state .big.bad { background:#FEE4E2; color:#D92D20; box-shadow:0 0 0 8px #FEF3F2; }
.as-state .big.info { background:#D4EBEE; color:${BLUE}; box-shadow:0 0 0 8px #E6F2F3; }
.as-state h3 { margin:0 0 8px; font-size:20px; font-weight:700; color:#101828; }
.as-state p { margin:0 0 24px; font-size:14px; color:#667085; line-height:1.6; }
.as-loader { width:36px; height:36px; margin:8px auto 16px; border-radius:50%; border:3px solid #EAECF0; border-top-color:${BLUE}; animation:as-spin .8s linear infinite; }
.as-anim { animation:as-in .3s ease both; }

.as-steps { display:flex; gap:10px; margin:0 0 26px; }
.as-steps div { flex:1; min-width:0; }
.as-steps b { display:block; height:4px; border-radius:99px; background:#EAECF0; transition:background .25s; }
.as-steps div.on b, .as-steps div.done b { background:${BLUE}; }
.as-steps span { display:block; margin-top:8px; font-size:12px; font-weight:600; color:#98A2B3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.as-steps div.on span { color:${BLUE}; }
.as-steps div.done span { color:#475467; }
.as-track { margin:0 0 24px; padding:16px; border-radius:10px; background:#F9FAFB; border:1px solid #EAECF0; }
.as-track small { display:block; font-size:11.5px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#667085; }
.as-track b { display:block; margin-top:6px; font-size:22px; font-weight:700; letter-spacing:2px; color:${NAVY}; font-variant-numeric:tabular-nums; }
.as-otp { text-align:center; font-size:20px !important; font-weight:600 !important; letter-spacing:10px; font-variant-numeric:tabular-nums; }

/* compact brand bar shown above the form on small screens */
.as-mbar { display:none; align-items:center; gap:10px; padding:14px 20px; background:${NAVY}; color:#fff; }
.as-mbar .as-mark { width:30px; height:30px; font-size:14px; border-radius:7px; }
.as-mbar b { font-size:14px; font-weight:700; }

@media (max-width: 1100px) {
  .as-left { padding:32px 36px 26px; }
  .as-left h1 { font-size:31px; }
  .as-float.f1 { right:-8px; }
}
@media (max-height: 760px) { .as-pv { display:none; } }
@media (max-width: 900px) {
  .as, .as.wide { grid-template-columns:1fr; }
  .as-left { display:none; }
  .as-mbar { display:flex; }
  .as-top { padding:16px 20px 0; min-height:0; }
  .as-main { padding:20px 20px 28px; align-items:flex-start; }
  .as-bottom { padding:0 20px 18px; }
}
@media (max-width: 480px) {
  .as-grid { grid-template-columns:1fr; }
  .as-title { font-size:23px; }
  .as-btns { flex-direction:column-reverse; }
}
@media (prefers-reduced-motion: reduce) { .as * { animation:none !important; } }
`;

export const Ic = ({ name }) => <span className="ic"><Svg name={name} size={18} /></span>;

/* text box with optional icon + show / hide for passwords */
export const Field = React.forwardRef(function Field({ id, label, req, icon, type = 'text', bad, className = '', full, children, ...rest }, ref) {
  const [show, setShow] = useState(false);
  const isPwd = type === 'password';
  const Tag = type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input';
  const inputType = Tag === 'input' ? (isPwd && show ? 'text' : type) : undefined;
  return (
    <div className={full ? 'full' : undefined}>
      {label && <label className="as-lbl" htmlFor={id}>{label}{req && <em> *</em>}</label>}
      <div className="as-field">
        {icon && <Ic name={icon} />}
        <Tag id={id} ref={ref} type={inputType} className={`as-in${bad ? ' bad' : ''} ${className}`}
          aria-invalid={bad || undefined} style={isPwd ? { paddingRight: 44 } : undefined} {...rest}>{children}</Tag>
        {isPwd && (
          <button type="button" className="as-show" onMouseDown={e => e.preventDefault()} onClick={() => setShow(s => !s)}
            aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}>
            <Svg name={show ? 'eyeOff' : 'eye'} size={18} />
          </button>
        )}
      </div>
    </div>
  );
});

const ALERT_ICON = { error: 'alert', success: 'okCircle', info: 'info' };
export const Alert = ({ msg }) => {
  if (!msg) return null;
  const t = msg.type || 'error';
  return (
    <div className={`as-alert ${t}`} role={t === 'error' ? 'alert' : 'status'}>
      <Svg name={ALERT_ICON[t] || 'info'} size={17} /><span>{msg.text}</span>
    </div>
  );
};
/* info box with an icon (account details etc.) */
export const Note = ({ icon = 'info', children }) => <div className="as-alert info"><Svg name={icon} size={17} /><span>{children}</span></div>;

/* big round icon for result screens: ok | bad | mail */
export const StateIcon = ({ kind }) => (
  <div className={`big ${kind === 'ok' ? 'ok' : kind === 'bad' ? 'bad' : 'info'}`}>
    <Svg name={kind === 'ok' ? 'check' : kind === 'bad' ? 'alert' : 'mail'} size={26} stroke={2} />
  </div>
);

export const Btn = ({ kind = 'pri', busy, busyText, children, ...rest }) => (
  <button className={`as-btn ${kind}`} disabled={busy || rest.disabled} {...rest}>
    {busy ? <><span className="as-spin" style={kind === 'out' || kind === 'ghost' ? { borderColor: '#EAECF0', borderTopColor: BLUE } : undefined} />{busyText || 'Please wait…'}</> : children}
  </button>
);

/* password strength hint under a new-password box */
export function PwdHint({ pwd, conf }) {
  if (conf !== undefined) {
    if (!conf) return null;
    return pwd === conf ? <div className="as-hint ok">Passwords match</div> : <div className="as-hint">Passwords do not match</div>;
  }
  if (!pwd) return null;
  if (pwd.length < 6) return <div className="as-hint">Use at least 6 characters ({pwd.length}/6)</div>;
  const score = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(pwd)).length + (pwd.length >= 10 ? 1 : 0);
  return score >= 4 ? <div className="as-hint ok">Strong password</div> : <div className="as-hint warn">Fair — add upper-case letters, numbers or symbols</div>;
}

/* the product, drawn small: a dashboard window with two floating notifications (illustration only, not live data) */
const BARS = [[46, 38], [58, 44], [52, 50], [70, 56], [64, 60], [84, 70]];
function Preview() {
  return (
    <div className="as-pv" aria-hidden="true">
      <div className="as-win">
        <div className="as-win-bar"><i /><i /><i /><span>Dashboard</span></div>
        <div className="as-win-body">
          <div className="as-win-nav">{['dashboard', 'file', 'cart', 'factory', 'ledger', 'users'].map((n, i) => <span key={n} className={i === 0 ? 'on' : ''}><Svg name={n} size={15} /></span>)}</div>
          <div className="as-win-main">
            <div className="as-kpis">
              <div className="as-kpi"><small>Sales · this month</small><b>₹ 4.82 Cr <em>▲ 12%</em></b></div>
              <div className="as-kpi"><small>Receivables</small><b>₹ 1.36 Cr</b></div>
              <div className="as-kpi"><small>Open jobs</small><b>38 <em>6 due</em></b></div>
            </div>
            <div className="as-chart">
              <div className="as-chart-h">Sales vs collection<span><span><i style={{ background: '#03444f' }} />Sales</span><span><i style={{ background: '#8FD3DC' }} />Collected</span></span></div>
              <div className="as-bars">{BARS.map(([s, c], i) => <div key={i}><b style={{ height: `${s}%`, animationDelay: `${i * 70}ms` }} /><b style={{ height: `${c}%`, animationDelay: `${i * 70 + 40}ms` }} /></div>)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="as-float f1"><span><Svg name="check" size={16} stroke={2.4} /></span><div><b>Invoice approved</b><small>Sent to the client by email</small></div></div>
      <div className="as-float f2"><span><Svg name="ledger" size={16} /></span><div><b>GSTR-3B ready</b><small>Tax worked out from your bills</small></div></div>
    </div>
  );
}

/**
 * kicker  — small label over the headline · heading — headline · text — paragraph
 * points  — check list · modules — true = show all ERP modules
 * title / subtitle — heading over the form · top — content for the top-right of the form side
 * shakeKey — change it to shake the form (e.g. on a wrong password) · wide — wider form (registration)
 * (mood / say / tagline are accepted for older callers and ignored)
 */
export default function AuthShell({ kicker, heading, text, points, modules, title, subtitle, top, wide, shakeKey, children }) {
  const formRef = useRef(null);
  useEffect(() => {
    if (!shakeKey || !formRef.current) return;
    const el = formRef.current; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }, [shakeKey]);

  const mods = modules === true ? ERP_MODULES : modules;
  const host = typeof window !== 'undefined' ? window.location.host : '';
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const year = new Date().getFullYear();

  return (
    <div className={`as${wide ? ' wide' : ''}`}>
      <style>{CSS}</style>

      <aside className="as-left">
        <div className="as-brand">
          <div className="as-mark">S</div>
          <div><b>{PRODUCT_NAME}</b><small>Enterprise resource planning</small></div>
        </div>

        <div className="as-hero">
          {kicker && <div className="as-kicker"><i />{kicker}</div>}
          {heading && <h1>{heading}</h1>}
          {text && <p>{text}</p>}
          {points?.length > 0 && (
            <ul className="as-points">{points.map(p => <li key={p}><span><Svg name="check" size={13} stroke={2.4} /></span>{p}</li>)}</ul>
          )}
          {mods?.length > 0 && <Preview />}
          {mods?.length > 0 && <>
            <div className="as-mods-h">{mods.length} modules, one system</div>
            <div className="as-chips">
              {mods.map(m => <span key={m.name} className="as-chip" title={m.text}><Svg name={m.icon} size={13} />{m.name}</span>)}
            </div>
          </>}
        </div>

        <div className="as-meta">
          <span><Svg name={secure ? 'lock' : 'globe'} size={13} />{secure ? 'Secure connection' : 'Connected to'} {host}</span>
          <span>Version {PRODUCT_VERSION}</span>
          <span>© {year} {PRODUCT_NAME}</span>
        </div>
      </aside>

      <main className="as-right">
        <div className="as-mbar"><div className="as-mark">S</div><b>{PRODUCT_NAME}</b></div>
        <div className="as-top">{top}</div>
        <div className="as-main">
          <div ref={formRef} className="as-form">
            <img className="as-logo" src={CLIENT_LOGO} alt="Company logo" onError={e => { e.currentTarget.style.display = 'none'; }} />
            {title && <h2 className="as-title">{title}</h2>}
            {subtitle && <p className="as-sub">{subtitle}</p>}
            {children}
          </div>
        </div>
        <div className="as-bottom"><span>{PRODUCT_NAME} · v{PRODUCT_VERSION}</span><span>Authorised users only</span></div>
      </main>
    </div>
  );
}
