import React, { useState, useEffect, useRef } from 'react';
import { useLock } from '../context/LockContext';

const F = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const CSS = `
@keyframes ls-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes ls-slide-up {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes ls-shake {
  0%,100% { transform: translateX(0); }
  20%     { transform: translateX(-10px); }
  40%     { transform: translateX(10px); }
  60%     { transform: translateX(-7px); }
  80%     { transform: translateX(7px); }
}
@keyframes ls-ring-spin {
  from { transform: translate(-50%,-50%) rotate(0deg); }
  to   { transform: translate(-50%,-50%) rotate(360deg); }
}
@keyframes ls-ring-spin2 {
  from { transform: translate(-50%,-50%) rotate(0deg); }
  to   { transform: translate(-50%,-50%) rotate(-360deg); }
}
@keyframes ls-glow {
  0%,100% { box-shadow: 0 0 0 0 rgba(58,97,134,0.5); }
  50%     { box-shadow: 0 0 0 14px rgba(58,97,134,0); }
}

.ls-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, #06101e 0%, #0d1f3c 45%, #162c54 80%, #07111f 100%);
  font-family: ${F};
  animation: ls-fade-in 0.4s ease;
  overflow: hidden;
}
.ls-card {
  position: relative; z-index: 2;
  width: 380px;
  padding: 40px 40px 36px;
  background: rgba(255,255,255,0.045);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 20px;
  box-shadow: 0 40px 100px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.07);
  text-align: center;
  animation: ls-slide-up 0.4s cubic-bezier(.22,1,.36,1);
}
.ls-card.shake { animation: ls-shake 0.45s ease; }

.ls-pin-input {
  width: 100%;
  padding: 13px 16px;
  background: rgba(255,255,255,0.07);
  border: 1.5px solid rgba(255,255,255,0.15);
  border-radius: 10px;
  color: #fff;
  font-size: 22px;
  letter-spacing: 10px;
  text-align: center;
  font-family: monospace;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.ls-pin-input:focus {
  border-color: rgba(58,97,134,0.8);
  background: rgba(58,97,134,0.12);
}
.ls-pin-input::placeholder {
  letter-spacing: 4px;
  font-size: 16px;
  opacity: 0.35;
}

.ls-btn {
  width: 100%;
  padding: 13px;
  background: linear-gradient(135deg, #3A6186, #2A4D6E);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  font-family: ${F};
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: opacity 0.15s, transform 0.1s;
}
.ls-btn:hover  { opacity: 0.88; }
.ls-btn:active { transform: scale(0.98); }
.ls-btn:disabled { opacity: 0.5; cursor: not-allowed; }
`;

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh  = now.getHours().toString().padStart(2, '0');
  const mm  = now.getMinutes().toString().padStart(2, '0');
  const date = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 58, fontWeight: 200, color: '#fff', letterSpacing: 6, lineHeight: 1 }}>
        {hh}<span style={{ opacity: 0.4 }}>:</span>{mm}
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.42)', marginTop: 6 }}>{date}</div>
    </div>
  );
}

export default function LockScreen() {
  const { unlock, user } = useLock();
  const [pin,   setPin]   = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [busy,  setBusy]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const doUnlock = async () => {
    if (pin.length !== 4) { setError('Please enter your 4-digit PIN'); return; }
    setBusy(true);
    const ok = await unlock(pin);
    setBusy(false);
    if (!ok) {
      setPin('');
      setError('Incorrect PIN. Please try again.');
      setShake(true);
      setTimeout(() => { setShake(false); inputRef.current?.focus(); }, 500);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter') doUnlock();
  };

  const initials = (user?.name || user?.username || 'U')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const displayName = user?.name || user?.username || 'User';

  return (
    <>
      <style>{CSS}</style>
      <div className="ls-overlay">

        {/* Decorative rings */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 600, height: 600, border: '1px solid rgba(255,255,255,0.03)', borderRadius: '50%', transform: 'translate(-50%,-50%)' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 900, height: 900, border: '1px solid rgba(255,255,255,0.02)', borderRadius: '50%', transform: 'translate(-50%,-50%)' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 460, height: 460, border: '1px dashed rgba(58,97,134,0.12)', borderRadius: '50%', animation: 'ls-ring-spin 40s linear infinite', transformOrigin: 'center' }} />
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 700, height: 700, border: '1px dashed rgba(58,97,134,0.07)', borderRadius: '50%', animation: 'ls-ring-spin2 60s linear infinite', transformOrigin: 'center' }} />
        {/* Glow blobs */}
        <div style={{ position: 'absolute', top: '15%', left: '12%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(58,97,134,0.1), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '8%',  width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(20,131,126,0.07), transparent 70%)', pointerEvents: 'none' }} />

        {/* Card */}
        <div className={`ls-card${shake ? ' shake' : ''}`}>

          {/* Logo */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg,#3A6186,#2A4D6E)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', animation: 'ls-glow 3s ease-in-out infinite', position: 'relative' }}>
              <span style={{ fontSize: 30 }}>⚡</span>
              <div style={{ position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: '50%', background: 'rgba(204,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>🔒</div>
            </div>
          </div>

          {/* Brand name */}
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: '0.3px', marginBottom: 2 }}>
            Universal Core ERP Solutions
          </div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 20 }}>
            Session Locked
          </div>

          {/* Clock */}
          <Clock />

          {/* Divider */}
          <div style={{ width: 48, height: 1, background: 'rgba(255,255,255,0.1)', margin: '18px auto 20px' }} />

          {/* User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#3A6186,#14837e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{displayName}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>Enter PIN to unlock</div>
            </div>
          </div>

          {/* PIN input */}
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={e => { setError(''); setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); }}
            onKeyDown={onKey}
            placeholder="Enter 4-digit PIN"
            className="ls-pin-input"
            autoComplete="off"
            style={{ marginBottom: 10 }}
          />

          {/* Error */}
          <div style={{ height: 20, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {error && (
              <div style={{ fontSize: 12, color: '#f87171', fontWeight: 600 }}>⚠ {error}</div>
            )}
          </div>

          {/* Unlock button */}
          <button className="ls-btn" onClick={doUnlock} disabled={busy || pin.length !== 4}>
            {busy ? 'Verifying…' : '🔓 Unlock'}
          </button>

          <div style={{ marginTop: 18, fontSize: 10.5, color: 'rgba(255,255,255,0.22)' }}>
            Press Enter or click Unlock to continue
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'absolute', bottom: 18, left: 0, right: 0, textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.4px' }}>
          Epsilongroup · Universal Core ERP Solutions · © 2025
        </div>
      </div>
    </>
  );
}
