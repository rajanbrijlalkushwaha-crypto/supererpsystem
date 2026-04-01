/**
 * Finacle-style single-line header bar.
 * Brand | Company selector | Shortcut | User | Date/Time | Logout
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../context/CompanyContext';

const SHORTCUTS = {
  'CC':  '/client/create',   'CV':  '/client/view',
  'VC':  '/vendor/create',   'VV':  '/vendor/view',
  'TI':  '/tally/import',    'TP':  '/tally/pending',
  'ADM': '/admin/companies',
};

function useClickOutside(ref, onClose) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onClose]);
}

const Header = ({ username, onLogout }) => {
  const [shortcut,     setShortcut]     = useState('');
  const [error,        setError]        = useState('');
  const [showCoSwitch, setShowCoSwitch] = useState(false);

  const navigate = useNavigate();
  const coRef    = useRef(null);
  const { companies, selectedCompany, selectCompany } = useCompany();

  useClickOutside(coRef, () => setShowCoSwitch(false));

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const handleGo = useCallback(() => {
    const key  = shortcut.trim().toUpperCase();
    const path = SHORTCUTS[key];
    if (path) { setError(''); setShortcut(''); navigate(path); }
    else      { setError(`Unknown: "${shortcut}"`); }
  }, [shortcut, navigate]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleGo();
    if (e.key !== 'Enter') setError('');
  };

  useEffect(() => {
    const h = (e) => { if (e.key === 'F5') { e.preventDefault(); window.location.reload(); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  /* Separator */
  const Sep = () => (
    <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
  );

  return (
    <header className="header">

      {/* Brand */}
      <div className="header-brand">
        <div className="header-brand-icon" style={{ fontSize: 20, fontWeight: 900 }}>ε</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.3 }}>Epsilon ERP</div>
          <div style={{ fontSize: 9, opacity: 0.5, fontWeight: 400, marginTop: 1 }}>Enterprise Suite</div>
        </div>
      </div>

      {/* Company selector */}
      <div ref={coRef} className="header-company-selector">
        <button className="company-switch-btn" onClick={() => setShowCoSwitch(p => !p)}>
          🏢 {selectedCompany ? selectedCompany.companyName : 'Select Company'} ▾
        </button>
        {showCoSwitch && (
          <div className="company-dropdown">
            <div className="company-dropdown-title">Switch Company</div>
            {companies.length === 0 ? (
              <div className="company-dropdown-empty">
                No companies.{' '}
                <span onClick={() => { navigate('/admin/companies'); setShowCoSwitch(false); }}
                  style={{ color: '#1a4a7a', cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }}>
                  Add one
                </span>
              </div>
            ) : companies.map(co => (
              <div key={co.companyId}
                className={`company-dropdown-item${selectedCompany?.companyId === co.companyId ? ' active' : ''}`}
                onClick={() => { selectCompany(co); setShowCoSwitch(false); }}>
                <strong>{co.companyName}</strong>
                {co.isDefault && <span style={{ fontSize: 10, marginLeft: 5, color: '#1a4a7a' }}>(Default)</span>}
                <div style={{ fontSize: 10, color: '#888' }}>{co.gstin || co.city || ''}</div>
              </div>
            ))}
            <div className="company-dropdown-footer"
              onClick={() => { navigate('/admin/companies'); setShowCoSwitch(false); }}>
              ⚙ Manage Companies
            </div>
          </div>
        )}
      </div>

      <Sep />

      {/* Shortcut input */}
      <div className="header-shortcut">
        <span className="shortcut-label">Code:</span>
        <div className="shortcut-input-wrap">
          <input
            className="shortcut-input"
            type="text"
            value={shortcut}
            onChange={e => { setShortcut(e.target.value); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="CV"
            maxLength={6}
            title="Shortcut codes: CV=View Clients, CC=Create Client, VV=View Vendors, VC=Create Vendor, TI=Tally Import, ADM=Admin"
          />
          {error && <span className="shortcut-error">{error}</span>}
        </div>
        <button className="shortcut-go-btn" onClick={handleGo}>Go</button>
      </div>

      {/* Right: user + date + logout */}
      <div className="header-right">
        <div className="user-info">
          <div className="user-avatar">{username?.[0]?.toUpperCase()}</div>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ color: '#e2eaf8', fontWeight: 600, fontSize: 12.5 }}>{username}</div>
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>{dateStr} · {timeStr}</div>
          </div>
        </div>
        <button className="logout-btn" onClick={onLogout}>↪ Logout</button>
      </div>

    </header>
  );
};

export default Header;
