/* Shared look for the Tally Reconciliation tabs — plain, flat, one line per row. */
export const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const money = n => (parseFloat(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtD = d => { if (!d) return '—'; const s = String(d).slice(0, 10).split('-'); return s.length === 3 ? `${s[2]}-${s[1]}-${s[0]}` : d; };
export const whenTxt = d => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
export const curFy = (() => { const t = new Date(); const y = t.getMonth() >= 3 ? t.getFullYear() : t.getFullYear() - 1; return `${String(y).slice(2)}-${String(y + 1).slice(2)}`; })();
export const FYS = (() => { const out = []; const y0 = 2000 + parseInt(curFy.slice(0, 2), 10); for (let y = y0; y >= 2022; y--) out.push(`${String(y).slice(2)}-${String(y + 1).slice(2)}`); return out; })();

export const RECON_CSS = `
  .rc button, .rc select, .rc input { box-shadow: none !important; text-shadow: none !important; font-family: inherit; }
  .rc-card { background: #fff; border: 1px solid #E4E7EC; border-radius: 10px; }
  .rc-ctl { height: 32px; border: 1px solid #D0D5DD !important; border-radius: 7px !important; padding: 0 10px; font-size: 12.5px; background: #fff !important; color: #344054; outline: none; }
  .rc-btn { height: 32px; padding: 0 14px; border: 1px solid #D0D5DD !important; border-radius: 7px !important; background: #fff !important; color: #344054; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .rc-btn:hover:not(:disabled) { background: #F9FAFB !important; }
  .rc-btn:disabled { opacity: .5; cursor: default; }
  .rc-btn.primary { background: #104f4f !important; border-color: #104f4f !important; color: #fff; }
  .rc-btn.green { background: #079455 !important; border-color: #079455 !important; color: #fff; }
  .rc-btn.sm { height: 26px; padding: 0 10px; font-size: 11.5px; }
  .rc-seg { display: inline-flex; border: 1px solid #D0D5DD; border-radius: 7px; overflow: hidden; }
  .rc-seg button { height: 30px; padding: 0 14px; border: none !important; border-radius: 0 !important; background: #fff !important; color: #475467; font-size: 12.5px; font-weight: 600; cursor: pointer; }
  .rc-seg button + button { border-left: 1px solid #D0D5DD !important; }
  .rc-seg button.on { background: #104f4f !important; color: #fff; }
  .rc-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12.5px; color: #101828; }
  .rc-tbl th { position: sticky; top: 0; z-index: 2; background: #F9FAFB; border-bottom: 1px solid #D0D5DD; border-right: 1px solid #EAECF0; padding: 10px 9px; font-size: 11px; font-weight: 700; color: #475467; text-transform: uppercase; letter-spacing: .3px; text-align: left; white-space: nowrap; }
  .rc-tbl td { border-bottom: 1px solid #EAECF0; border-right: 1px solid #F2F4F7; padding: 9px 9px; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rc-tbl th:last-child, .rc-tbl td:last-child { border-right: none; }
  .rc-tbl .n { text-align: right; font-variant-numeric: tabular-nums; }
  .rc-tbl tr.row:hover td { background: #F5FAFF; }
  .rc-tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
  .rc-add { visibility: hidden; border: 1px dashed #B2CCFF !important; background: #F5FAFF !important; color: #175CD3; border-radius: 6px !important; font-size: 11px; font-weight: 700; padding: 1px 8px; cursor: pointer; }
  .rc-tbl tr.row:hover .rc-add { visibility: visible; }
`;
