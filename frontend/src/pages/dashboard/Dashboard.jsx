import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';

const initials = (name = '') =>
  name.replace(/^M\/s\.?\s*/i, '')
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(w => !/^(private|limited|ltd|pvt|the|and)$/i.test(w))
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() || '')
      .join('') || 'E';

export default function Dashboard() {
  const { user }            = useAuth();
  const { selectedCompany } = useCompany();
  const [logoFailed, setLogoFailed] = useState(false);

  const username    = user?.name || user?.username || 'User';
  const companyName = selectedCompany?.companyName || '';
  const logoUrl = selectedCompany?.logoFileName && !logoFailed
    ? `/api/companies/logo/${encodeURIComponent(selectedCompany.logoFileName)}?companyId=${selectedCompany.companyId}`
    : null;

  return (
    <div className="dash-root">
      <style>{`
        .dash-root {
          min-height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0;
          padding: 40px 24px;
          background: #FFFFFF;
          font-family: var(--font);
          text-align: center;
        }
        @keyframes dash-in {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: none; }
        }
        .dash-root > * { animation: dash-in 0.5s ease both; }
        .dash-root > *:nth-child(2) { animation-delay: 0.06s; }
        .dash-root > *:nth-child(3) { animation-delay: 0.12s; }
        .dash-root > *:nth-child(4) { animation-delay: 0.18s; }
        .dash-root > *:nth-child(5) { animation-delay: 0.24s; }

        .dash-logo {
          width: 132px; height: 132px;
          object-fit: contain;
          margin-bottom: 28px;
          /* Company logos are JPEGs with an off-white backing; multiply blends
             that square into the white page instead of showing it as a box. */
          mix-blend-mode: multiply;
        }
        .dash-monogram {
          width: 84px; height: 84px;
          border-radius: 18px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 28px;
          background: var(--primary);
          color: #fff;
          font-size: 32px; font-weight: 700; letter-spacing: 0.5px;
        }
        .dash-company {
          font-size: clamp(22px, 3.2vw, 30px);
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.4px;
          line-height: 1.25;
          max-width: 18ch;
        }
        .dash-rule {
          width: 44px; height: 3px; border-radius: 2px;
          background: var(--primary);
          margin: 18px 0 20px;
        }
        .dash-greeting {
          font-size: 15px;
          color: var(--text-secondary);
        }
        .dash-greeting strong {
          color: var(--text-primary);
          font-weight: 600;
        }
        .dash-hint {
          margin-top: 6px;
          font-size: 13px;
          color: var(--text-muted);
        }
      `}</style>

      {logoUrl
        ? <img
            className="dash-logo"
            src={logoUrl}
            alt={companyName ? `${companyName} logo` : 'Company logo'}
            onError={() => setLogoFailed(true)}
          />
        : <div className="dash-monogram" aria-hidden="true">{initials(companyName)}</div>}

      <div className="dash-company">{companyName || 'Super ERP System'}</div>

      <div className="dash-rule" />

      <div className="dash-greeting">
        Welcome back, <strong>{username}</strong>
      </div>

      <div className="dash-hint">
        {companyName
          ? 'Select a module from the menu to begin'
          : 'Select a company to get started'}
      </div>
    </div>
  );
}
