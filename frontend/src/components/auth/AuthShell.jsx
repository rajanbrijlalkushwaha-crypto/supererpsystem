/* Shared layout for every sign-in page (login, forgot / reset / set password, supplier registration).
 * Super ERP look: a teal brand side (the S mark, "Plan • Manage • Grow", the module tiles and a laptop showing
 * the dashboard) and a white rounded card on the right holding the page's form. Line icons only, no emoji.
 * Pages put their form inside; title / subtitle go over the form. */
import React, { useEffect, useRef, useState } from 'react';
import { PRODUCT_NAME, PRODUCT_VERSION, CLIENT_LOGO } from '../../utils/brand';
import { Svg } from '../ui/Icon';

export { Svg };

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const HEAD = "'Poppins', 'Inter', -apple-system, 'Segoe UI', sans-serif";   // the Super ERP word mark
export const MARK = '/brand/super-mark.png';             // the S mark, teal (white backgrounds)
export const MARK_WHITE = '/brand/super-mark-white.png'; // the S mark, white (teal backgrounds)

/* The ERP's modules — the tiles on the sign-in side (same names as the menu inside the ERP). */
export const ERP_MODULES = [
  { icon: 'cart',     name: 'Sales',         text: 'Clients, orders, DC, bills, e-invoice' },
  { icon: 'store',    name: 'Purchase',      text: 'Vendors, POs, GRN, purchase bills' },
  { icon: 'folder',   name: 'Jobcode',       text: 'Every order file in one place' },
  { icon: 'factory',  name: 'Manufacturing', text: 'BOM, issue, MRP, QC, job cost' },
  { icon: 'box',      name: 'Stock',         text: 'Items and where they lie' },
  { icon: 'ledger',   name: 'Account',       text: 'Receipts, payments, journals' },
  { icon: 'file',     name: 'Books & GST',   text: 'Ledgers, P&L, GSTR-1 / 3B' },
  { icon: 'users',    name: 'HR',            text: 'Employees, attendance, payroll' },
  { icon: 'shield',   name: 'Insurance',     text: 'Policies and claims' },
  { icon: 'lock',     name: 'Passwords',     text: 'Portal logins, kept encrypted' },
  { icon: 'settings', name: 'Admin',         text: 'Users, roles, companies' },
  { icon: 'user',     name: 'Me',            text: 'Profile and signature' },
];

/* Where "Back to sign in" goes: the login the person is using (new or classic). */
export const loginPath = () => {
  try { return localStorage.getItem('ui-version') === 'beta' ? '/beta/login' : '/login'; } catch { return '/login'; }
};

const NAVY = '#03444f';   // beta teal (same as the app's side bar / buttons)
const BLUE = '#03444f';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&display=swap');
.as { position:relative; isolation:isolate; min-height:100vh; min-height:calc(100vh / var(--ui-zoom, 1)); display:grid;
  grid-template-columns:minmax(0, 1.2fr) minmax(440px, .8fr); font-family:${F}; color:#101828; -webkit-font-smoothing:antialiased; overflow:hidden;
  background:
    radial-gradient(900px 600px at 18% 30%, rgba(46,150,160,.35), transparent 65%),
    linear-gradient(160deg, #0B5F68 0%, #07505A 35%, #04414A 70%, #032F36 100%); }
.as.wide { grid-template-columns:minmax(0, .85fr) minmax(560px, 1.15fr); }
.as * { box-sizing:border-box; }
@keyframes as-in   { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
@keyframes as-spin { to { transform:rotate(360deg) } }
@keyframes as-shake { 20%,60% { transform:translateX(-5px) } 40%,80% { transform:translateX(5px) } }

/* background: sweeping light curves, dots and a faint city */
.as-bg { position:absolute; inset:0; z-index:-1; pointer-events:none; }
.as-bg svg { position:absolute; inset:0; width:100%; height:100%; }
.as-dots { position:absolute; width:150px; height:150px; background-image:radial-gradient(rgba(255,255,255,.55) 1.6px, transparent 1.8px); background-size:18px 18px; opacity:.55; }
.as-dots.d1 { left:22px; top:18px; mask-image:linear-gradient(135deg, #000 30%, transparent 85%); }
.as-dots.d2 { right:18px; bottom:14px; mask-image:linear-gradient(315deg, #000 30%, transparent 85%); }

/* ── left: brand ── */
.as-left { position:relative; min-width:0; color:#fff; display:flex; flex-direction:column; align-items:center; padding:46px 40px 18px; }
.as-lock { display:flex; align-items:center; gap:18px; }
.as-lock img { width:clamp(150px, 15vw, 230px); height:auto; filter:drop-shadow(0 10px 18px rgba(0,0,0,.25)); }
.as-word { font-family:${HEAD}; line-height:.95; }
.as-word b { display:block; font-size:clamp(46px, 4.6vw, 74px); font-weight:700; letter-spacing:-.5px; }
.as-word strong { display:block; font-size:clamp(56px, 5.8vw, 92px); font-weight:800; letter-spacing:1px; }
.as-word span { display:flex; align-items:center; gap:12px; margin-top:6px; font-size:clamp(20px, 2vw, 30px); font-weight:500; letter-spacing:3px; }
.as-word span::before, .as-word span::after { content:''; flex:1; height:2px; min-width:30px; background:rgba(255,255,255,.75); }
.as-tag { margin-top:24px; font-family:${HEAD}; font-size:clamp(20px, 2vw, 28px); font-weight:600; letter-spacing:.3px; text-align:center; }
.as-tag i { font-style:normal; margin:0 14px; opacity:.85; }
.as-sub2 { margin-top:8px; font-size:clamp(14px, 1.3vw, 19px); color:#E3F4F6; text-align:center; }

.as-tiles { display:grid; grid-template-columns:repeat(10, minmax(0, 1fr)); gap:12px; width:100%; max-width:700px; margin-top:28px; }
.as-tile { grid-column:span 2; }
.as-tile { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; min-height:86px; padding:12px 6px; border-radius:16px;
  background:linear-gradient(180deg, rgba(255,255,255,.97), rgba(228,242,244,.95)); color:#0B4E57; text-align:center;
  box-shadow:0 10px 24px rgba(0,0,0,.18), inset 0 1px 0 #fff; transition:transform .15s; }
.as-tile:hover { transform:translateY(-2px); }
.as-tile svg { color:#0B5F68; }
.as-tile b { font-size:13.5px; font-weight:600; color:#13363C; line-height:1.15; }
.as-tiles .as-tile:nth-child(11) { grid-column:4 / span 2; }   /* Admin and Me centred under the rows */
.as-tiles .as-tile:nth-child(12) { grid-column:6 / span 2; }

/* the laptop with the dashboard (a drawing, not live data) */
.as-desk { position:relative; flex:1; width:100%; max-width:760px; min-height:250px; margin-top:18px; display:flex; align-items:flex-end; justify-content:center; }
.as-lap { position:relative; z-index:1; width:min(500px, 80%); margin:0 0 22px -10px; }
.as-scr { position:relative; border-radius:14px 14px 4px 4px; padding:10px 10px 12px; background:linear-gradient(180deg, #2B3236, #15191B);
  box-shadow:0 30px 60px rgba(0,0,0,.4); transform:perspective(1400px) rotateX(3deg) rotateY(5deg); transform-origin:bottom center; }
.as-app { display:grid; grid-template-columns:96px 1fr; height:200px; border-radius:6px; overflow:hidden; background:#fff; color:#13363C; }
.as-app nav { background:#0E4A52; color:#CFE7EA; padding:10px 8px; font-size:8.5px; display:flex; flex-direction:column; gap:7px; }
.as-app nav b { color:#fff; font-family:${HEAD}; font-size:11px; font-weight:700; margin-bottom:4px; }
.as-app nav span { display:flex; align-items:center; gap:5px; padding:3px 5px; border-radius:4px; }
.as-app nav span.on { background:rgba(255,255,255,.14); color:#fff; }
.as-app main { padding:10px 12px; min-width:0; }
.as-app h6 { margin:0 0 8px; font-family:${HEAD}; font-size:12px; font-weight:700; }
.as-k3 { display:grid; grid-template-columns:repeat(3, 1fr); gap:7px; }
.as-k3 div { border-radius:7px; padding:6px 8px; font-size:7.5px; color:#355057; }
.as-k3 b { display:block; font-size:11.5px; font-weight:800; color:#13363C; margin:2px 0 1px; }
.as-k3 em { font-style:normal; font-weight:700; color:#0B7A5A; }
.as-ch { display:grid; grid-template-columns:1.35fr 1fr; gap:7px; margin-top:8px; }
.as-ch div { border:1px solid #E3EDEF; border-radius:7px; padding:4px; height:96px; }
.as-ch svg { width:100%; height:100%; display:block; }
.as-base { position:relative; height:16px; margin:0 -9%; border-radius:2px 2px 14px 14px; background:linear-gradient(180deg, #E7ECEE, #AEB8BC); box-shadow:0 18px 30px rgba(0,0,0,.35); }
.as-base::before { content:''; position:absolute; left:42%; right:42%; top:0; height:5px; border-radius:0 0 6px 6px; background:#C9D1D4; }
.as-plant { position:relative; z-index:2; flex:none; width:110px; margin:0 -14px 18px 0; }
.as-table { position:absolute; z-index:0; left:-40px; right:-40px; bottom:-18px; height:52px; background:linear-gradient(180deg, rgba(255,255,255,.95), #E9F1F2); border-radius:60% 60% 0 0 / 40px 40px 0 0; }

/* ── right: the card ── */
.as-right { position:relative; display:flex; flex-direction:column; min-width:0; }
.as-right::before { content:''; position:absolute; inset:-10% -30% -10% 6%; z-index:-1; border-radius:52% 0 0 48% / 60% 0 0 40%;
  background:linear-gradient(180deg, rgba(240,248,249,.96), rgba(222,238,240,.9)); }
.as-top { display:flex; justify-content:flex-end; align-items:center; gap:12px; padding:18px 30px 0; min-height:48px; font-size:12.5px; color:#4A6B71; }
.as-main { flex:1; display:flex; align-items:center; justify-content:center; padding:18px 30px 26px; }
.as-form { width:100%; max-width:470px; padding:40px 40px 34px; border-radius:30px; background:#fff;
  box-shadow:0 30px 70px rgba(3,47,54,.22), 0 2px 6px rgba(3,47,54,.06); animation:as-in .35s ease both; }
.as.wide .as-form { max-width:720px; }
.as-form.shake { animation:as-shake .4s ease; }
.as-logo { display:block; width:120px; height:auto; margin:0 auto 14px; }
.as-client { display:block; height:26px; max-width:160px; object-fit:contain; margin:0 auto 10px; opacity:.9; }
.as-title { margin:0; text-align:center; font-family:${HEAD}; font-size:32px; font-weight:700; letter-spacing:-.3px; color:#0E2E33; }
.as-sub { margin:6px 0 26px; text-align:center; font-size:15.5px; color:#3D555A; line-height:1.5; }
.as-mode { display:flex; justify-content:center; margin:-14px 0 20px; }
.as-mode span { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:99px; font-size:12px; font-weight:600; color:#0B5F68; background:#E6F3F4; border:1px solid #CDE6E9; }
.as-bottom { display:flex; justify-content:flex-end; flex-wrap:wrap; gap:6px 20px; padding:0 30px 16px; font-size:11.5px; color:#5E7A80; }
.as-bottom span { display:inline-flex; align-items:center; gap:6px; }

.as-tabs { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:4px; margin-bottom:24px; border-radius:12px; background:#EAF4F5; border:1px solid #D4EBEE; }
.as-tabs button { height:38px; border:none; border-radius:9px; background:transparent; cursor:pointer; font:600 13.5px ${F}; color:#667085;
  display:flex; align-items:center; justify-content:center; gap:7px; transition:background .15s, color .15s, box-shadow .15s; }
.as-tabs button:hover { color:#344054; }
.as-tabs button.on { background:${NAVY}; color:#fff; box-shadow:0 1px 3px rgba(16,24,40,.12); }

.as-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 16px; }
.as-grid .full { grid-column:1 / -1; }
.as-lbl { display:block; font-size:13px; font-weight:600; color:#344054; margin:0 0 6px; }
.as-lbl em { color:#D92D20; font-style:normal; }
.as-field { position:relative; margin-bottom:18px; }
.as-field .ic { position:absolute; left:18px; top:50%; transform:translateY(-50%); color:#1F3E44; pointer-events:none; display:grid; place-items:center; }
.as-in { width:100%; height:56px; padding:0 18px; border:1px solid #D3E0E3; border-radius:14px; outline:none; background:#fff;
  font:400 15.5px ${F}; color:#101828; box-shadow:0 1px 2px rgba(16,24,40,.04); transition:border-color .15s, box-shadow .15s; }
.as-field .ic + .as-in { padding-left:54px; }
textarea.as-in { height:auto; min-height:80px; padding:13px 16px; resize:vertical; line-height:1.5; }
select.as-in { cursor:pointer; appearance:none; -webkit-appearance:none; padding-right:40px;
  background:#fff url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8'><path d='M1 1.5l5 5 5-5' fill='none' stroke='%23667085' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/></svg>") no-repeat right 16px center; }
.as-in::placeholder { color:#8A9BA0; }
.as-in:hover { border-color:#AFC7CB; }
.as-in:focus { border-color:#2A9DAA; box-shadow:0 0 0 4px rgba(42,157,170,.16); }
.as-in.bad { border-color:#FDA29B; }
.as-in.bad:focus { box-shadow:0 0 0 4px rgba(217,45,32,.1); }
.as-show { position:absolute; right:8px; top:50%; transform:translateY(-50%); width:40px; height:40px; border:none; border-radius:10px; background:none;
  cursor:pointer; color:#1F3E44; display:grid; place-items:center; }
.as-show:hover { background:#EAF4F5; color:#03444f; }
.as-hint { margin:-12px 0 16px; font-size:12.5px; color:#D92D20; }
.as-hint.ok { color:#067647; }
.as-hint.warn { color:#B54708; }

.as-row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:-2px 0 24px; font-size:14.5px; }
.as-check { display:flex; align-items:center; gap:10px; cursor:pointer; color:#1F3438; user-select:none; }
.as-check input { position:absolute; opacity:0; pointer-events:none; }
.as-check i { width:20px; height:20px; border-radius:5px; border:1.5px solid #6F8589; display:grid; place-items:center; color:#fff; font-style:normal; transition:all .12s; }
.as-check i::after { content:''; width:9px; height:5px; border-left:2px solid #fff; border-bottom:2px solid #fff; transform:rotate(-45deg) translate(1px,-1px); opacity:0; }
.as-check input:checked + i { background:${BLUE}; border-color:${BLUE}; }
.as-check input:checked + i::after { opacity:1; }
.as-check input:focus-visible + i { box-shadow:0 0 0 4px rgba(3,68,79,.15); }
.as-link { background:none; border:none; padding:0; cursor:pointer; font:600 14.5px ${F}; color:#0B6E78; }
.as-link:hover { color:#022F37; text-decoration:underline; }

.as-btn { width:100%; height:56px; border-radius:16px; cursor:pointer; font:600 17px ${F};
  display:flex; align-items:center; justify-content:center; gap:10px; transition:background .15s, box-shadow .15s, border-color .15s; }
.as-btn.pri { border:none; color:#fff; background:linear-gradient(180deg, #0D5F67, #063F46); box-shadow:0 10px 22px rgba(3,68,79,.28); transition:transform .12s, box-shadow .15s, background .15s; }
.as-btn.pri:hover:not(:disabled) { background:linear-gradient(180deg, #0A545C, #04353B); transform:translateY(-1px); box-shadow:0 14px 28px rgba(3,68,79,.32); }
.as-btn.pri:focus-visible, .as-btn.out:focus-visible { outline:none; box-shadow:0 0 0 4px rgba(3,68,79,.2); }
.as-btn.ok  { border:none; color:#fff; background:#079455; }
.as-btn.out { border:1px solid #D3E0E3; color:#13363C; background:#fff; box-shadow:0 2px 6px rgba(16,24,40,.06); }
.as-btn.out:hover:not(:disabled) { background:#F5FAFA; border-color:#AFC7CB; }
.as-btn.ghost { border:1px solid #EAECF0; color:#475467; background:#F9FAFB; }
.as-btn.ghost:hover:not(:disabled) { background:#F2F4F7; }
.as-btn:disabled { opacity:.6; cursor:not-allowed; }
.as-spin { width:18px; height:18px; border-radius:50%; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; animation:as-spin .6s linear infinite; }
.as-btns { display:flex; gap:12px; }
.as-btns .as-btn { flex:1; }

.as-or { display:flex; align-items:center; gap:14px; margin:22px 0; font-size:14px; color:#3D555A; }
.as-or::before, .as-or::after { content:''; flex:1; height:1px; background:#DCE6E8; }
.as-foot { margin-top:24px; text-align:center; font-size:15px; color:#1F3438; }
.as-foot .as-link { margin-left:8px; font-size:15px; }
.as-notice { margin-top:24px; padding-top:14px; border-top:1px solid #EEF3F4; display:flex; gap:8px; align-items:flex-start; font-size:12px; line-height:1.5; color:#7A8F93; }

.as-alert { display:flex; gap:10px; align-items:flex-start; padding:11px 13px; margin-bottom:18px; border-radius:12px; font-size:13.5px; line-height:1.5; word-break:break-word; }
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
.as-track { margin:0 0 24px; padding:16px; border-radius:12px; background:#F9FAFB; border:1px solid #EAECF0; }
.as-track small { display:block; font-size:11.5px; font-weight:600; letter-spacing:1px; text-transform:uppercase; color:#667085; }
.as-track b { display:block; margin-top:6px; font-size:22px; font-weight:700; letter-spacing:2px; color:${NAVY}; font-variant-numeric:tabular-nums; }
.as-otp { text-align:center; font-size:20px !important; font-weight:600 !important; letter-spacing:10px; font-variant-numeric:tabular-nums; }

/* compact brand bar shown above the card on small screens */
.as-mbar { display:none; flex-direction:column; align-items:center; gap:6px; padding:22px 20px 6px; color:#fff; text-align:center; }
.as-mbar img { width:96px; height:auto; }
.as-mbar b { font-family:${HEAD}; font-size:24px; font-weight:700; }
.as-mbar small { font-size:13px; color:#D7EEF1; }

@media (max-width: 1280px) { .as-tiles { gap:10px; } .as-tile { min-height:78px; } .as-tile b { font-size:12.5px; } }
@media (max-height: 820px) { .as-desk { display:none; } .as-left { justify-content:center; padding-bottom:40px; } }
@media (max-width: 1100px) {
  .as, .as.wide { grid-template-columns:1fr; }
  .as-left { display:none; }
  .as-mbar { display:flex; }
  .as-right::before { inset:150px -20% -10% -20%; border-radius:50% 50% 0 0 / 60px 60px 0 0; }
  .as-top { padding:12px 18px 0; min-height:0; justify-content:center; }
  .as-main { padding:14px 16px 24px; align-items:flex-start; }
  .as-bottom { justify-content:center; padding:0 16px 14px; }
}
@media (max-width: 520px) {
  .as-form { padding:28px 20px 24px; border-radius:24px; }
  .as-grid { grid-template-columns:1fr; }
  .as-title { font-size:26px; }
  .as-sub { font-size:14.5px; margin-bottom:20px; }
  .as-btns { flex-direction:column-reverse; }
  .as-row { font-size:13.5px; } .as-link { font-size:13.5px; }
}
@media (prefers-reduced-motion: reduce) { .as * { animation:none !important; } }
`;

export const Ic = ({ name }) => <span className="ic"><Svg name={name} size={22} /></span>;

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
            <Svg name={show ? "eyeOff" : "eye"} size={22} />
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

/* the background: light curves sweeping across, and a faint city on the left (drawing only) */
function Backdrop() {
  return (
    <div className="as-bg" aria-hidden="true">
      <svg viewBox="0 0 1536 1024" preserveAspectRatio="none">
        <defs>
          <linearGradient id="as-g1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".6" stopColor="#fff" stopOpacity=".18" /><stop offset="1" stopColor="#fff" stopOpacity=".55" /></linearGradient>
          <linearGradient id="as-g2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5FB8C2" stopOpacity=".55" /><stop offset="1" stopColor="#0B5F68" stopOpacity=".9" /></linearGradient>
        </defs>
        <g fill="#fff" opacity=".045">
          {[[20, 470, 40, 560], [64, 400, 34, 630], [102, 520, 52, 510], [160, 440, 30, 590], [196, 560, 46, 470], [248, 500, 28, 530], [690, 540, 40, 490], [734, 460, 30, 570], [770, 580, 48, 450], [824, 510, 34, 520]].map(([x, y, w, h]) => <rect key={x} x={x} y={y} width={w} height={h} />)}
        </g>
        <path d="M700 0 C 980 120 1080 300 1180 1024 L 1536 1024 L 1536 0 Z" fill="url(#as-g1)" />
        <path d="M0 990 C 400 860 780 900 1000 1024 L 0 1024 Z" fill="#fff" opacity=".12" />
        <path d="M1536 640 C 1440 860 1320 950 1060 1024 L 1536 1024 Z" fill="url(#as-g2)" />
        <path d="M1536 700 C 1460 880 1360 960 1180 1024" stroke="#fff" strokeOpacity=".5" strokeWidth="3" fill="none" />
      </svg>
      <div className="as-dots d1" /><div className="as-dots d2" />
    </div>
  );
}

/* a laptop showing the dashboard, and a plant (drawing only — not live data) */
function Laptop() {
  const line = 'M4 80 L22 64 L40 70 L58 50 L76 56 L94 34 L112 42 L130 22 L148 30 L166 12';
  return (
    <div className="as-desk" aria-hidden="true">
      <div className="as-table" />
      <svg className="as-plant" viewBox="0 0 120 170">
        <g fill="#2E8B57">
          <path d="M60 104 C 40 70 18 58 6 60 C 22 70 36 88 56 108 Z" /><path d="M60 104 C 50 60 54 28 66 8 C 70 34 68 70 62 108 Z" fill="#3FA463" />
          <path d="M62 106 C 80 70 100 56 116 54 C 100 68 86 88 66 110 Z" /><path d="M58 108 C 34 88 16 86 2 92 C 22 94 38 102 56 114 Z" fill="#3FA463" />
          <path d="M64 108 C 86 92 104 92 118 98 C 100 100 84 106 66 116 Z" fill="#3FA463" /><path d="M60 106 C 46 74 30 44 30 22 C 44 40 56 70 62 106 Z" fill="#257A4B" />
        </g>
        <path d="M30 112 H90 L84 166 H36 Z" fill="#F4F7F8" /><path d="M30 112 H90 L89 120 H31 Z" fill="#DDE5E7" />
      </svg>
      <div className="as-lap">
        <div className="as-scr">
          <div className="as-app">
            <nav><b>S Super</b>
              {['Dashboard', 'Sales', 'Purchase', 'Inventory', 'Accounts', 'Reports', 'Settings'].map((t, i) => <span key={t} className={i === 0 ? 'on' : ''}>▪ {t}</span>)}
            </nav>
            <main>
              <h6>Dashboard</h6>
              <div className="as-k3">
                <div style={{ background: '#DDF0F2' }}>Total Sales<b>₹2,50,000</b><em>↑ 12%</em></div>
                <div style={{ background: '#FBE3DE' }}>Purchase<b>₹1,80,000</b><em>↑ 8%</em></div>
                <div style={{ background: '#DDF3E6' }}>Profit<b>₹70,000</b><em>↑ 15%</em></div>
              </div>
              <div className="as-ch">
                <div><svg viewBox="0 0 170 90" preserveAspectRatio="none"><path d={`${line} L166 90 L4 90 Z`} fill="#BFE3E7" opacity=".6" /><path d={line} fill="none" stroke="#1A8C99" strokeWidth="2" /></svg></div>
                <div><svg viewBox="0 0 100 90" preserveAspectRatio="none">{[50, 34, 62, 44, 70, 58, 80].map((h, i) => <rect key={i} x={6 + i * 13} y={88 - h} width="8" height={h} rx="1.5" fill={i % 2 ? '#7CC5CE' : '#0E5A63'} />)}</svg></div>
              </div>
            </main>
          </div>
        </div>
        <div className="as-base" />
      </div>
    </div>
  );
}

/**
 * title / subtitle — heading over the form · mode — small label under it (e.g. "Supplier portal")
 * top — content for the top-right · shakeKey — change it to shake the form (wrong password) · wide — wider form (registration)
 * (kicker / heading / text / points / modules / mood / say / tagline are accepted for older callers; the brand side is the same on every page)
 */
export default function AuthShell({ title, subtitle, mode, top, wide, shakeKey, children }) {
  const formRef = useRef(null);
  useEffect(() => {
    if (!shakeKey || !formRef.current) return;
    const el = formRef.current; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }, [shakeKey]);

  const host = typeof window !== 'undefined' ? window.location.host : '';
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
  const year = new Date().getFullYear();

  return (
    <div className={`as${wide ? ' wide' : ''}`}>
      <style>{CSS}</style>
      <Backdrop />

      <aside className="as-left">
        <div className="as-lock">
          <img src={MARK_WHITE} alt="" />
          <div className="as-word"><b>Super</b><strong>ERP</strong><span>System</span></div>
        </div>
        <div className="as-tag">Plan<i>•</i>Manage<i>•</i>Grow</div>
        <div className="as-sub2">Your Complete Business Management Solution</div>
        <div className="as-tiles">
          {ERP_MODULES.map(m => <div key={m.name} className="as-tile" title={m.text}><Svg name={m.icon} size={30} stroke={1.7} /><b>{m.name}</b></div>)}
        </div>
        {!wide && <Laptop />}
      </aside>

      <main className="as-right">
        <div className="as-mbar"><img src={MARK_WHITE} alt="" /><b>{PRODUCT_NAME}</b><small>Plan • Manage • Grow</small></div>
        <div className="as-top">{top}</div>
        <div className="as-main">
          <div ref={formRef} className="as-form">
            <img className="as-logo" src={MARK} alt={PRODUCT_NAME} />
            {title && <h2 className="as-title">{title}</h2>}
            {subtitle && <p className="as-sub">{subtitle}</p>}
            {mode && <div className="as-mode"><span>{mode}</span></div>}
            {children}
            <img className="as-client" src={CLIENT_LOGO} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} style={{ marginTop: 22 }} />
          </div>
        </div>
        <div className="as-bottom">
          <span><Svg name={secure ? 'lock' : 'globe'} size={13} />{secure ? 'Secure connection to' : 'Connected to'} {host}</span>
          <span>© {year} {PRODUCT_NAME} · v{PRODUCT_VERSION} · Authorised users only</span>
        </div>
      </main>
    </div>
  );
}
