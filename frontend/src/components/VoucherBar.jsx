import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useNavTheme, NEU } from '../utils/navTheme';

/* VoucherBar — the strip of voucher types shown on top of every Transaction
   screen, Tally-style: each voucher has one function key (F5 Payment, F6 Receipt,
   F7 Journal as in Tally; the rest take the keys around them). The keys work only
   while a Transaction screen is open, so F5 still reloads everywhere else. */
export const VOUCHERS = [
  { key: 'F5',  label: 'Payment',     icon: '💳', path: '/account/payment/create', base: '/account/payment' },
  { key: 'F6',  label: 'Receipt',     icon: '📥', path: '/account/receipt/create', base: '/account/receipt' },
  { key: 'F7',  label: 'Journal',     icon: '📒', path: '/account/journal/view',   base: '/account/journal' },
  { key: 'F8',  label: 'Expense',     icon: '🧾', path: '/account/expense/create', base: '/account/expense' },
  { key: 'F9',  label: 'Debit Note',  icon: '📋', path: '/account/debit-note/view',  base: '/account/debit-note' },
  { key: 'F10', label: 'Credit Note', icon: '📄', path: '/account/credit-note/view', base: '/account/credit-note' },
  { key: 'F4',  label: 'Deposit',     icon: '🏧', path: '/account/deposit/view',   base: '/account/deposit' },
];

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const under = (path, base) => path === base || path.startsWith(base + '/');
export const isTransactionPath = path => VOUCHERS.some(v => under(path, v.base));

export default function VoucherBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [navTheme] = useNavTheme();
  const neu = navTheme === 'neu';
  const onTxn = isTransactionPath(pathname);

  useEffect(() => {
    if (!onTxn) return undefined;
    const onKey = e => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const v = VOUCHERS.find(x => x.key === e.key);
      if (!v) return;
      e.preventDefault();
      navigate(v.path);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTxn, navigate]);

  if (!onTxn) return null;

  return (
    <nav aria-label="Voucher types" style={neu ? {
      display: 'flex', alignItems: 'center', gap: 4, background: NEU.base, flexShrink: 0, height: 46, fontFamily: F,
      boxShadow: '0 4px 10px rgba(163,177,198,0.45)', position: 'relative', zIndex: 2, padding: '0 6px', overflowX: 'auto',
    } : {
      display: 'flex', alignItems: 'center', gap: 4, background: '#3A6186', borderBottom: '2px solid #2A4D6E',
      flexShrink: 0, height: 40, fontFamily: F, padding: '0 6px', overflowX: 'auto',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: neu ? NEU.strong : '#fff', textTransform: 'uppercase', letterSpacing: '0.8px',
        padding: '0 12px 0 4px', marginRight: 4, whiteSpace: 'nowrap', alignSelf: 'stretch', display: 'flex', alignItems: 'center',
        borderRight: neu ? '1px solid rgba(163,177,198,0.6)' : '2px solid rgba(255,255,255,0.18)' }}>
        Vouchers
      </div>
      {VOUCHERS.map(v => {
        const on = under(pathname, v.base);
        const keyBadge = (
          <span style={{ fontSize: 9.5, fontWeight: 800, padding: '1px 5px', borderRadius: 4, marginLeft: 2, fontFamily: 'monospace',
            ...(neu ? { background: NEU.base, boxShadow: NEU.insetSm, color: on ? NEU.accent : NEU.muted }
                    : { background: on ? '#FDE68A' : 'rgba(255,255,255,0.16)', color: on ? '#7C2D12' : 'rgba(255,255,255,0.9)' }) }}>
            {v.key}
          </span>
        );
        return (
          <Link key={v.base} to={v.path} title={`${v.label} (${v.key})`} style={neu ? {
            display: 'flex', alignItems: 'center', gap: 5, padding: '0 11px', height: 30, borderRadius: 10, flexShrink: 0,
            fontSize: 11.5, fontWeight: on ? 800 : 600, color: on ? NEU.accent : NEU.text, background: NEU.base,
            boxShadow: on ? NEU.inset : NEU.raisedSm, textDecoration: 'none', whiteSpace: 'nowrap', margin: '0 3px',
          } : {
            display: 'flex', alignItems: 'center', gap: 5, padding: '0 10px', height: 26, borderRadius: 6, flexShrink: 0,
            fontSize: 11.5, fontWeight: on ? 700 : 600, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap',
            background: on ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
            border: `1px solid ${on ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.22)'}`,
            boxShadow: on ? '0 2px 6px rgba(0,0,0,0.22)' : 'none',
          }}>
            <span style={{ fontSize: 12 }}>{v.icon}</span>{v.label}{keyBadge}
          </Link>
        );
      })}
    </nav>
  );
}
