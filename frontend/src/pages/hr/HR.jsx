/* HR — one page, a top bar: Recruitment | Employee | Salary.
 *   Recruitment — every candidate with the CV, status from New to Joined
 *   Employee    — full employee details; a selected candidate becomes an employee in one click
 *   Salary      — the monthly salary sheet (paid days, PF / ESI / PT, advances) and payslips
 */
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Recruitment from './Recruitment';
import Employees from './Employees';
import Salary from './Salary';
import { F, RECON_CSS } from '../tallyrecon/reconUi';

export const HR_TABS = [['recruitment', 'Recruitment'], ['employee', 'Employee'], ['salary', 'Salary']];

export default function HR() {
  const { tab = 'recruitment' } = useParams();
  const navigate = useNavigate();
  const cur = HR_TABS.some(([k]) => k === tab) ? tab : 'recruitment';
  return (
    <div className="rc" style={{ fontFamily: F, display: 'flex', flexDirection: 'column', height: '100%', background: '#F2F4F7' }}>
      <style>{RECON_CSS + `
        .rc-top { display: flex; align-items: stretch; gap: 2px; background: #fff; border-bottom: 1px solid #E4E7EC; padding: 0 14px; flex-shrink: 0; }
        .rc-top .ttl { display: flex; align-items: center; font-size: 13px; font-weight: 700; color: #101828; padding-right: 16px; margin-right: 6px; border-right: 1px solid #EAECF0; }
        .rc-top button { height: 44px; padding: 0 18px; border: none !important; border-bottom: 2px solid transparent !important; border-radius: 0 !important; background: none !important; font-size: 13px; font-weight: 600; color: #475467; cursor: pointer; }
        .rc-top button:hover { color: #104f4f; }
        .rc-top button.on { color: #104f4f; border-bottom-color: #104f4f !important; font-weight: 700; }
        .hr-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 14px; }
        .hr-grid label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 700; color: #475467; text-transform: uppercase; letter-spacing: .3px; }
        .hr-grid label.wide { grid-column: span 2; } .hr-grid label.full { grid-column: 1 / -1; }
        .hr-grid input, .hr-grid select, .hr-grid textarea { height: 34px; border: 1px solid #D0D5DD !important; border-radius: 7px !important; padding: 0 10px; font-size: 13px; font-weight: 500; color: #101828; text-transform: none; letter-spacing: 0; background: #fff !important; outline: none; font-family: inherit; }
        .hr-grid textarea { height: 64px; padding: 8px 10px; resize: vertical; }
        .hr-grid input:focus, .hr-grid select:focus, .hr-grid textarea:focus { border-color: #84ADFF !important; }
        .hr-sec { font-size: 12px; font-weight: 800; color: #104f4f; margin: 16px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #EAECF0; }
        .hr-modal { position: fixed; inset: 0; background: rgba(16,24,40,.5); z-index: 9000; display: flex; align-items: center; justify-content: center; padding: 16px; }
        .hr-modal > div { background: #fff; border-radius: 12px; width: min(920px, 97vw); max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; }
        .hr-modal .hd { padding: 14px 18px; border-bottom: 1px solid #EAECF0; font-size: 15px; font-weight: 700; }
        .hr-modal .bd { padding: 6px 18px 16px; overflow: auto; }
        .hr-modal .ft { padding: 12px 18px; border-top: 1px solid #EAECF0; display: flex; justify-content: flex-end; gap: 8px; align-items: center; }
        .hr-file { display: inline-flex; align-items: center; gap: 6px; border: 1px solid #EAECF0; border-radius: 6px; padding: 3px 8px; font-size: 12px; margin: 0 6px 6px 0; background: #F9FAFB; }
        .hr-file button { border: none !important; background: none !important; cursor: pointer; padding: 0; font-size: 12px; }
        .rc-tbl input.cell { width: 100%; height: 26px; border: 1px solid #D0D5DD !important; border-radius: 5px !important; padding: 0 6px; font-size: 12px; text-align: right; font-family: inherit; background: #fff !important; box-sizing: border-box; }
      `}</style>
      <div className="rc-top">
        <div className="ttl">HR</div>
        {HR_TABS.map(([k, label]) => <button key={k} className={cur === k ? 'on' : ''} onClick={() => navigate(`/hr/${k}`)}>{label}</button>)}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {cur === 'recruitment' && <Recruitment />}
        {cur === 'employee' && <Employees />}
        {cur === 'salary' && <Salary />}
      </div>
    </div>
  );
}
