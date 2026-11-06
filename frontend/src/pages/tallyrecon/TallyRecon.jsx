/* TallyRecon — "Tally Reconciliation": one place, one top bar.
 *   Client  — Tally debtors → import as a Draft client (edit in CRM, send for approval)
 *   SO      — Tally sales orders → import only when the client is in the ERP with the same name + GST
 *   Vendor  — Tally creditors → import as a Draft vendor
 *   PO      — Tally purchase orders → import only when the vendor is in the ERP with the same name + GST
 *   Payment / Receipt — Tally bank entries → assign SO / PO, match an entry made in the ERP first
 *   Journal — Tally journals → assign the SO a project expense belongs to
 * Nothing is ever written to Tally.
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TallyDebtors from '../client/TallyDebtors';
import TallyCreditors from '../vendor/TallyCreditors';
import TallySalesOrders from '../salesorder/TallySalesOrders';
import TallyPurchaseOrders from './TallyPurchaseOrders';
import TallyBook from './TallyBook';
import TallyJournal from './TallyJournal';
import { F, RECON_CSS } from './reconUi';

export const RECON_TABS = [
  ['client', 'Client'], ['so', 'SO'], ['vendor', 'Vendor'], ['po', 'PO'], ['payment', 'Payment'], ['receipt', 'Receipt'], ['journal', 'Journal'],
];

export default function TallyRecon() {
  const { tab = 'client' } = useParams();
  const navigate = useNavigate();
  const cur = RECON_TABS.some(([k]) => k === tab) ? tab : 'client';
  return (
    <div className="rc" style={{ fontFamily: F, display: 'flex', flexDirection: 'column', height: '100%', background: '#F2F4F7' }}>
      <style>{RECON_CSS + `
        .rc-top { display: flex; align-items: stretch; gap: 2px; background: #fff; border-bottom: 1px solid #E4E7EC; padding: 0 14px; flex-shrink: 0; }
        .rc-top .ttl { display: flex; align-items: center; font-size: 13px; font-weight: 700; color: #101828; padding-right: 16px; margin-right: 6px; border-right: 1px solid #EAECF0; white-space: nowrap; }
        .rc-top button { height: 44px; padding: 0 16px; border: none !important; border-bottom: 2px solid transparent !important; border-radius: 0 !important; background: none !important; font-size: 13px; font-weight: 600; color: #475467; cursor: pointer; }
        .rc-top button:hover { color: #104f4f; }
        .rc-top button.on { color: #104f4f; border-bottom-color: #104f4f !important; font-weight: 700; }
      `}</style>
      <div className="rc-top">
        <div className="ttl">Tally Reconciliation</div>
        {RECON_TABS.map(([k, label]) => <button key={k} className={cur === k ? 'on' : ''} onClick={() => navigate(`/tally-recon/${k}`)}>{label}</button>)}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {cur === 'client' && <TallyDebtors embedded />}
        {cur === 'vendor' && <TallyCreditors embedded />}
        {cur === 'so' && <div style={{ height: '100%', padding: '12px 14px', boxSizing: 'border-box' }}><TallySalesOrders /></div>}
        {cur === 'po' && <TallyPurchaseOrders />}
        {(cur === 'payment' || cur === 'receipt') && <TallyBook key={cur} type={cur} />}
        {cur === 'journal' && <TallyJournal />}
      </div>
    </div>
  );
}
