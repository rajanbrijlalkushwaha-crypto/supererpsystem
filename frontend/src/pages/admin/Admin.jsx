import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Companies from './Companies';
import Users from './Users';
import EmailConfig from './EmailConfig';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const TABS = [
  { id: 'companies', label: 'Companies',       icon: '🏢', adminOnly: false },
  { id: 'users',     label: 'User Management', icon: '👥', adminOnly: true  },
  { id: 'email',     label: 'Email Config',    icon: '📧', adminOnly: true  },
];

export default function Admin() {
  const [tab] = useState(() => {
    const h = window.location.hash.replace('#','');
    return TABS.find(t => t.id === h) ? h : 'companies';
  });
  const [activeTab, setActiveTab] = useState(tab);
  const { isAdmin } = useAuth();

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div style={{ fontFamily: F, minHeight: '100%' }}>
      <div style={{ display:'flex', borderBottom:'2px solid #E5E7EB', background:'#F8FAFC', marginBottom:20, borderRadius:'10px 10px 0 0', overflow:'hidden' }}>
        {visibleTabs.map(t => {
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'12px 22px', cursor:'pointer', fontFamily:F,
              background: active?'#fff':'transparent', border:'none',
              borderBottom: active?'2px solid #2563EB':'2px solid transparent',
              color: active?'#2563EB':'#6B7280',
              fontSize:13, fontWeight: active?700:500, marginBottom:-2, transition:'all 0.15s',
            }}>
              <span style={{ fontSize:16 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'companies' && <Companies />}
      {activeTab === 'users'     && isAdmin && <Users />}
      {activeTab === 'email'     && isAdmin && <EmailConfig />}
    </div>
  );
}
