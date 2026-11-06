/* Bank Statement page: "From Tally" (every bank entry with the running balance, the default)
   and "ERP entries" (the payments & receipts entered in the ERP). The chosen tab is remembered. */
import React, { useState } from 'react';
import TallyStatement from './TallyStatement';
import StatementView from './View';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function StatementTabs() {
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('stmtTab') || 'tally'; } catch { return 'tally'; } });
  const pick = t => { setTab(t); try { localStorage.setItem('stmtTab', t); } catch { /* ignore */ } };
  return (
    <div style={{ fontFamily: F, display: 'flex', flexDirection: 'column', height: '100%', background: '#F2F4F7' }}>
      <div style={{ display: 'flex', gap: 4, padding: '10px 14px 0', flexShrink: 0 }}>
        {[['tally', '📒 From Tally'], ['erp', '🧾 ERP entries']].map(([k, l]) => (
          <button key={k} onClick={() => pick(k)} style={{ height: 32, padding: '0 16px', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontFamily: F, fontSize: 12.5, fontWeight: 800,
            border: '1px solid #EAECF0', borderBottom: 'none', background: tab === k ? '#fff' : 'transparent', color: tab === k ? '#104f4f' : '#667085' }}>{l}</button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === 'tally'
          ? <div style={{ height: '100%', padding: '0 14px 12px', boxSizing: 'border-box' }}><TallyStatement /></div>
          : <StatementView />}
      </div>
    </div>
  );
}
