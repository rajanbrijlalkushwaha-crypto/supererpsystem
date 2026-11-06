/* Display size of the whole app — like the browser's Ctrl −/+, but automatic and per browser.
 *   'auto' (default) picks a size from the screen width; or a fixed 0.8 / 0.9 / 1 / 1.1.
 * Applied as CSS zoom on <html>, so every page, popup and portal scales together.
 * Under CSS zoom the browser reports positions (getBoundingClientRect, mouse clientX/Y,
 * innerWidth/innerHeight) in screen pixels, while styles are in page pixels — code that places
 * a popup from those numbers divides by the zoom: use px(), vw(), vh() below. */
import { useEffect, useState } from 'react';

const KEY = 'ui-scale';
const EVT = 'uiscale:change';
export const SCALE_OPTIONS = [['auto', 'Auto'], ['0.8', '80%'], ['0.9', '90%'], ['1', '100%'], ['1.1', '110%']];

export const readScalePref = () => { try { const v = localStorage.getItem(KEY); return SCALE_OPTIONS.some(([k]) => k === v) ? v : 'auto'; } catch { return 'auto'; } };

/* screen width → size (laptops get a smaller UI, big monitors full size) */
const autoZoom = w => (w >= 1600 ? 1 : w >= 1440 ? 0.9 : w >= 1280 ? 0.85 : 0.8);

let current = 1;
export const getZoom = () => current;
export const px = n => n / current;                       // screen px → page px
export const vw = () => window.innerWidth / current;      // page width in page px
export const vh = () => window.innerHeight / current;     // page height in page px

export function applyScale() {
  const pref = readScalePref();
  const z = pref === 'auto' ? autoZoom(window.innerWidth) : parseFloat(pref) || 1;
  current = z;
  const root = document.documentElement;
  root.style.zoom = z === 1 ? '' : String(z);
  root.style.setProperty('--ui-zoom', String(z));          // the shell uses calc(100vh / var(--ui-zoom))
  return z;
}

export function setScalePref(v) {
  try { localStorage.setItem(KEY, v); } catch { /* storage blocked — still applies for this session */ }
  applyScale();
  window.dispatchEvent(new CustomEvent(EVT, { detail: v }));
}

/* call once at start-up: applies the size and follows window resizes (auto mode) */
let started = false;
export function initUiScale() {
  if (started) return; started = true;
  applyScale();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { if (readScalePref() === 'auto') { applyScale(); window.dispatchEvent(new CustomEvent(EVT, { detail: 'auto' })); } }, 150); });
}

export function useUiScale() {
  const [pref, setPref] = useState(readScalePref);
  const [zoom, setZoom] = useState(getZoom);
  useEffect(() => {
    const h = () => { setPref(readScalePref()); setZoom(getZoom()); };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return { pref, zoom, setPref: setScalePref };
}
