/* Look of the top bar + side menu: 'classic' (navy) or 'neu' (neumorphism).
   Saved per browser; Header and SidebarNav both follow it live. */
import { useEffect, useState } from 'react';

const KEY = 'navtheme';
const EVT = 'navtheme:change';

export const readNavTheme = () => {
  try { return localStorage.getItem(KEY) === 'neu' ? 'neu' : 'classic'; } catch { return 'classic'; }
};

export const saveNavTheme = (theme) => {
  const t = theme === 'neu' ? 'neu' : 'classic';
  try { localStorage.setItem(KEY, t); } catch { /* storage blocked — still switch for this session */ }
  window.dispatchEvent(new CustomEvent(EVT, { detail: t }));
};

export function useNavTheme() {
  const [theme, setTheme] = useState(readNavTheme);
  useEffect(() => {
    const h = e => setTheme(e.detail === 'neu' ? 'neu' : 'classic');
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);
  return [theme, saveNavTheme];
}

/* Neumorphism: one soft surface colour; shapes are drawn only by a light
   shadow (top-left) and a dark shadow (bottom-right). */
export const NEU = {
  base:     '#E0E5EC',
  dark:     '#A3B1C6',
  light:    '#FFFFFF',
  text:     '#1F2937',
  strong:   '#000000',
  muted:    '#4B5563',
  accent:   '#C2410C',
  raised:   '6px 6px 12px #A3B1C6, -6px -6px 12px #FFFFFF',
  raisedSm: '3px 3px 6px #A3B1C6, -3px -3px 6px #FFFFFF',
  inset:    'inset 3px 3px 6px #A3B1C6, inset -3px -3px 6px #FFFFFF',
  insetSm:  'inset 2px 2px 4px #A3B1C6, inset -2px -2px 4px #FFFFFF',
};
