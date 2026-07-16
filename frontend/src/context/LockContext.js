import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const LockContext = createContext(null);

const INACTIVITY_MS = 2 * 60 * 1000;
export const PIN_KEY    = 'erp_screen_lock_pin';
const LOCKED_KEY = 'erp_screen_locked';   // sessionStorage — survives refresh, cleared on tab close

export const hashPin = async (pin) => {
  const enc = new TextEncoder();
  const buf = await window.crypto.subtle.digest('SHA-256', enc.encode(pin + 'epsilon-screen-lock-2025'));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const persistLocked = (v) => {
  if (v) sessionStorage.setItem(LOCKED_KEY, '1');
  else   sessionStorage.removeItem(LOCKED_KEY);
};

export function LockProvider({ children, user }) {
  const hasStoredPin = !!localStorage.getItem(PIN_KEY);
  const wasLocked    = sessionStorage.getItem(LOCKED_KEY) === '1';

  const [isLocked, setIsLocked] = useState(hasStoredPin && wasLocked);
  const [hasPin,   setHasPin]   = useState(hasStoredPin);
  const timerRef  = useRef(null);
  const lockedRef = useRef(hasStoredPin && wasLocked);

  const lock = useCallback(() => {
    if (localStorage.getItem(PIN_KEY)) {
      setIsLocked(true);
      lockedRef.current = true;
      persistLocked(true);
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!lockedRef.current && localStorage.getItem(PIN_KEY)) {
      timerRef.current = setTimeout(lock, INACTIVITY_MS);
    }
  }, [lock]);

  const resetTimer = useCallback(() => {
    if (!lockedRef.current) startTimer();
  }, [startTimer]);

  useEffect(() => {
    const evts = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'];
    evts.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    if (!lockedRef.current) startTimer();
    return () => {
      evts.forEach(e => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer, startTimer]);

  const unlock = useCallback(async (pin) => {
    const stored = localStorage.getItem(PIN_KEY);
    if (!stored) {
      setIsLocked(false); lockedRef.current = false;
      persistLocked(false); startTimer(); return true;
    }
    const hash = await hashPin(pin);
    if (hash === stored) {
      setIsLocked(false); lockedRef.current = false;
      persistLocked(false); startTimer(); return true;
    }
    return false;
  }, [startTimer]);

  const savePin = useCallback(async (pin) => {
    const hash = await hashPin(pin);
    localStorage.setItem(PIN_KEY, hash);
    setHasPin(true);
  }, []);

  const removePin = useCallback(() => {
    localStorage.removeItem(PIN_KEY);
    sessionStorage.removeItem(LOCKED_KEY);
    setHasPin(false); setIsLocked(false);
    lockedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <LockContext.Provider value={{ isLocked, lock, unlock, hasPin, savePin, removePin, user }}>
      {children}
    </LockContext.Provider>
  );
}

export const useLock = () => useContext(LockContext);
