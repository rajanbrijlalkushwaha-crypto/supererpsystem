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

const NAVY = '#0B1F3A';
const BLUE = '#1A56DB';

const CSS = `
.as { min-height:100vh; min-height:calc(100vh / var(--ui-zoom, 1)); display:grid; grid-template-columns:minmax(0, 1.08fr) minmax(0, 1fr);
  font-family:${F}; color:#101828; background:#fff; -webkit-font-smoothing:antialiased; }
.as.wide { grid-template-columns:minmax(0, .8fr) minmax(0, 1.2fr); }
.as * { box-sizing:border-box; }
@keyframes as-in   { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
@keyframes as-spin { to { transform:rotate(360deg) } }
@keyframes as-shake { 20%,60% { transform:translateX(-5px) } 40%,80% { transform:translateX(5px) } }

/* ── left: brand panel ── */
.as-left { position:relative; overflow:hidden; color:#fff; display:flex; flex-direction:column; padding:40px 56px 32px;
  background:
    radial-gradient(900px 500px at 100% 0%, rgba(26,86,219,.42), transparent 60%),
    radial-gradient(700px 500px at 0% 100%, rgba(14,165,233,.18), transparent 60%),
    linear-gradient(160deg, #0B1F3A 0%, #0A1A31 55%, #071324 100%); }
.as-left::before { content:''; position:absolute; inset:0; pointer-events:none; opacity:.5;
  background-image:linear-gradient(rgba(255,255,255,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.045) 1px, transparent 1px);
  background-size:44px 44px; mask-image:linear-gradient(180deg, #000 0%, rgba(0,0,0,.6) 60%, transparent 100%); }
.as-left > * { position:relative; }
.as-brand { display:flex; align-items:center; gap:12px; }
.as-mark { width:38px; height:38px; border-radius:9px; display:grid; place-items:center; font-weight:800; font-size:17px; letter-spacing:-.5px;
  background:linear-gradient(135deg, #3B82F6, ${BLUE}); box-shadow:0 6px 16px rgba(26,86,219,.45), inset 0 1px 0 rgba(255,255,255,.25); }
.as-brand b { display:block; font-size:15px; font-weight:700; letter-spacing:.1px; }
.as-brand small { display:block; font-size:11px; color:#94A3B8; letter-spacing:.3px; margin-top:1px; }
.as-hero { flex:1; display:flex; flex-direction:column; justify-content:center; padding:40px 0 24px; max-width:620px; }
.as-kicker { align-self:flex-start; font-size:11.5px; font-weight:600; letter-spacing:1.4px; text-transform:uppercase; color:#7DB2FF;
  padding-left:12px; border-left:2px solid #3B82F6; }
.as-left h1 { margin:16px 0 0; font-size:36px; line-height:1.15; font-weight:700; letter-spacing:-.8px; }
.as-left p { margin:14px 0 0; max-width:520px; font-size:14.5px; line-height:1.65; color:#A9B7CC; }
.as-points { list-style:none; margin:26px 0 0; padding:0; display:grid; gap:12px; max-width:520px; }
.as-points li { display:flex; gap:12px; align-items:flex-start; font-size:13.5px; color:#D5DEEA; line-height:1.5; }
.as-points li span { width:22px; height:22px; flex-shrink:0; border-radius:6px; display:grid; place-items:center; color:#7DB2FF; background:rgba(59,130,246,.14); border:1px solid rgba(125,178,255,.25); }
.as-mods-h { display:flex; align-items:center; gap:10px; margin:30px 0 12px; font-size:11px; font-weight:600; letter-spacing:1.3px; text-transform:uppercase; color:#7F8EA3; }
.as-mods-h::after { content:''; flex:1; height:1px; background:rgba(255,255,255,.1); }
.as-mods { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:1px; max-width:600px; border-radius:10px; overflow:hidden;
  background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.08); }
.as-mod { display:flex; align-items:center; gap:11px; padding:11px 13px; background:rgba(8,22,42,.82); transition:background .15s; }
.as-mod:hover { background:rgba(20,45,85,.9); }
.as-mod .mi { width:30px; height:30px; flex-shrink:0; border-radius:7px; display:grid; place-items:center; color:#8AB8FF;
  background:rgba(59,130,246,.12); border:1px solid rgba(125,178,255,.18); }
.as-mod b { display:block; font-size:12.5px; font-weight:600; color:#E6ECF5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.as-mod small { display:block; font-size:11px; color:#7F8EA3; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.as-meta { display:flex; flex-wrap:wrap; gap:8px 22px; font-size:11.5px; color:#7F8EA3; }
.as-meta span { display:inline-flex; align-items:center; gap:6px; }

/* ── right: form ── */
.as-right { display:flex; flex-direction:column; min-width:0; background:#fff; }
.as-top { display:flex; justify-content:flex-end; align-items:center; gap:14px; padding:22px 40px 0; min-height:56px; font-size:12.5px; color:#667085; }
.as-main { flex:1; display:flex; align-items:center; justify-content:center; padding:24px 40px; }
.as-form { width:100%; max-width:400px; animation:as-in .35s ease both; }
.as.wide .as-form { max-width:640px; }
.as-form.shake { animation:as-shake .4s ease; }
.as-logo { display:block; height:34px; max-width:220px; object-fit:contain; margin-bottom:28px; }
.as-title { margin:0; font-size:26px; font-weight:700; letter-spacing:-.5px; color:#101828; }
.as-sub { margin:6px 0 26px; font-size:14px; color:#667085; line-height:1.55; }
.as-bottom { display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:0 40px 22px; font-size:11.5px; color:#98A2B3; }

.as-tabs { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:4px; margin-bottom:24px; border-radius:9px; background:#F2F4F7; border:1px solid #EAECF0; }
.as-tabs button { height:34px; border:none; border-radius:6px; background:transparent; cursor:pointer; font:600 13px ${F}; color:#667085;
  display:flex; align-items:center; justify-content:center; gap:7px; transition:background .15s, color .15s, box-shadow .15s; }
.as-tabs button:hover { color:#344054; }
.as-tabs button.on { background:#fff; color:${NAVY}; box-shadow:0 1px 2px rgba(16,24,40,.08), 0 1px 3px rgba(16,24,40,.1); }

.as-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 16px; }
.as-grid .full { grid-column:1 / -1; }
.as-lbl { display:block; font-size:13px; font-weight:600; color:#344054; margin:0 0 6px; }
.as-lbl em { color:#D92D20; font-style:normal; }
.as-field { position:relative; margin-bottom:18px; }
.as-field .ic { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#98A2B3; pointer-events:none; display:grid; place-items:center; }
.as-in { width:100%; height:44px; padding:0 14px; border:1px solid #D0D5DD; border-radius:8px; outline:none; background:#fff;
  font:400 14.5px ${F}; color:#101828; box-shadow:0 1px 2px rgba(16,24,40,.05); transition:border-color .15s, box-shadow .15s; }
.as-field .ic + .as-in { padding-left:40px; }
textarea.as-in { height:auto; min-height:76px; padding:11px 14px; resize:vertical; line-height:1.5; }
select.as-in { cursor:pointer; appearance:none; -webkit-appearance:none; padding-right:36px;
  background:#fff url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8'><path d='M1 1.5l5 5 5-5' fill='none' stroke='%23667085' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/></svg>") no-repeat right 14px center; }
.as-in::placeholder { color:#98A2B3; }
.as-in:hover { border-color:#B0B8C4; }
.as-in:focus { border-color:#84ADFF; box-shadow:0 0 0 4px rgba(26,86,219,.12); }
.as-in.bad { border-color:#FDA29B; }
.as-in.bad:focus { box-shadow:0 0 0 4px rgba(217,45,32,.1); }
.as-show { position:absolute; right:4px; top:50%; transform:translateY(-50%); width:36px; height:36px; border:none; border-radius:6px; background:none;
  cursor:pointer; color:#667085; display:grid; place-items:center; }
.as-show:hover { background:#F2F4F7; color:#344054; }
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
.as-check input:focus-visible + i { box-shadow:0 0 0 4px rgba(26,86,219,.15); }
.as-link { background:none; border:none; padding:0; cursor:pointer; font:600 13.5px ${F}; color:${BLUE}; }
.as-link:hover { color:#1E429F; text-decoration:underline; }

.as-btn { width:100%; height:44px; border-radius:8px; cursor:pointer; font:600 14.5px ${F};
  display:flex; align-items:center; justify-content:center; gap:8px; transition:background .15s, box-shadow .15s, border-color .15s; }
.as-btn.pri { border:1px solid ${BLUE}; color:#fff; background:${BLUE}; box-shadow:0 1px 2px rgba(16,24,40,.08); }
.as-btn.pri:hover:not(:disabled) { background:#1E429F; border-color:#1E429F; }
.as-btn.pri:focus-visible, .as-btn.out:focus-visible { outline:none; box-shadow:0 0 0 4px rgba(26,86,219,.2); }
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
.as-alert.info { background:#F5F8FF; color:#1E429F; border:1px solid #D1E0FF; }

.as-title + .as-state, .as-sub + .as-state { margin-top:24px; }
.as-state { text-align:center; padding:4px 0; animation:as-in .3s ease both; }
.as-state .big { width:56px; height:56px; margin:0 auto 18px; border-radius:50%; display:grid; place-items:center; }
.as-state .big.ok { background:#DCFAE6; color:#079455; box-shadow:0 0 0 8px #ECFDF3; }
.as-state .big.bad { background:#FEE4E2; color:#D92D20; box-shadow:0 0 0 8px #FEF3F2; }
.as-state .big.info { background:#D1E0FF; color:${BLUE}; box-shadow:0 0 0 8px #EFF4FF; }
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
  .as-left h1 { font-size:30px; }
}
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
          {kicker && <div className="as-kicker">{kicker}</div>}
          {heading && <h1>{heading}</h1>}
          {text && <p>{text}</p>}
          {!mods && points?.length > 0 && (
            <ul className="as-points">{points.map(p => <li key={p}><span><Svg name="check" size={13} stroke={2.4} /></span>{p}</li>)}</ul>
          )}
          {mods?.length > 0 && <>
            <div className="as-mods-h">{mods.length} integrated modules</div>
            <div className="as-mods">
              {mods.map(m => (
                <div key={m.name} className="as-mod" title={`${m.name} — ${m.text}`}>
                  <span className="mi"><Svg name={m.icon} size={16} /></span>
                  <span style={{ minWidth: 0 }}><b>{m.name}</b><small>{m.text}</small></span>
                </div>
              ))}
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
