import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCompany } from '../../context/CompanyContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export default function Dashboard() {
  const { user }            = useAuth();
  const { selectedCompany } = useCompany();
  const username = user?.name || user?.username || 'User';

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: F,
      background: 'linear-gradient(135deg, #f0f4f8 0%, #e8eef5 50%, #dde6f0 100%)',
    }}>
      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .dash-logo    { animation: fade-up 0.6s ease both; }
        .dash-title   { animation: fade-up 0.6s ease 0.15s both; }
        .dash-divider { animation: fade-up 0.6s ease 0.25s both; }
        .dash-user    { animation: fade-up 0.6s ease 0.35s both; }
        .dash-tag     { animation: fade-up 0.6s ease 0.45s both; }
      `}</style>

      {/* Logo mark */}
      <div className="dash-logo" style={{
        width: 80, height: 80, borderRadius: 20,
        background: 'linear-gradient(135deg, #3A6186, #2A4D6E)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 12px 40px rgba(58,97,134,0.30)',
        marginBottom: 32,
      }}>
        <span style={{ fontSize: 40, lineHeight: 1 }}>⚡</span>
      </div>

      {/* Company name */}
      <div className="dash-title" style={{
        fontSize: 32, fontWeight: 800, color: '#1E293B',
        letterSpacing: '-0.5px', textAlign: 'center', lineHeight: 1.3,
        marginBottom: 6,
      }}>
        Welcome to<br />
        <span style={{ color: '#3A6186' }}>Universal Core ERP Solutions</span>
      </div>

      {/* Divider */}
      <div className="dash-divider" style={{
        width: 60, height: 3, borderRadius: 2,
        background: 'linear-gradient(90deg, #3A6186, #5A8AB8)',
        margin: '20px auto',
      }} />

      {/* Username */}
      <div className="dash-user" style={{
        fontSize: 18, fontWeight: 600, color: '#475569', marginBottom: 8,
      }}>
        Hello, <span style={{ color: '#3A6186', fontWeight: 800 }}>{username}</span> 👋
      </div>

      {/* Company tagline */}
      <div className="dash-tag" style={{
        fontSize: 13, color: '#94A3B8', fontWeight: 500,
      }}>
        {selectedCompany?.companyName
          ? `Currently working in: ${selectedCompany.companyName}`
          : 'Select a company to get started'}
      </div>
    </div>
  );
}
