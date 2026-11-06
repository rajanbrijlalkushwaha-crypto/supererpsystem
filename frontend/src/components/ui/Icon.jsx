/* Line icon set (24×24, stroke) shared by the sign-in pages and the new (beta) app shell. */
import React from 'react';

/* 24×24 stroke icons */
export const ICON_PATHS = {
  dashboard: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  folder:    'M3 6.5h6l2 2h10V19H3z',
  users:     'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1 M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M22 19v-1a4 4 0 0 0-3-3.9 M16 4.1a3.5 3.5 0 0 1 0 6.8',
  cart:      'M2.5 4h2.2l2.4 11h11.2L21 7.5H5.8 M9 20.2h.01 M18 20.2h.01',
  box:       'M21 8l-9-5-9 5v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
  factory:   'M2 21V10l6 4v-4l6 4V6l8 5v10z M6 17.5h2 M11 17.5h2 M16 17.5h2',
  swap:      'M4 8h15l-3.5-3.5 M20 16H5l3.5 3.5',
  ledger:    'M5 3.5h11.5a2 2 0 0 1 2 2V20.5H7a2 2 0 0 1-2-2z M9 8h6 M9 12h6 M9 16h3.5',
  sync:      'M20 11a8 8 0 0 0-14.8-4 M4 4.5V8.5h4 M4 13a8 8 0 0 0 14.8 4 M20 19.5v-4h-4',
  badge:     'M3.5 5h17v14h-17z M9 11.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4 M5.8 16.2a3.3 3.3 0 0 1 6.4 0 M14.5 9h3.5 M14.5 13h3.5',
  chart:     'M4 20V11 M10 20V5 M16 20v-6.5 M2 20.5h20',
  store:     'M3.5 9 5 4h14l1.5 5 M3.5 9h17v11h-17z M9.5 20v-5.5h5V20',
  shield:    'M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z M9 12l2 2 4-4',
  spark:     'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z M19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  user:      'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4.5 20.5a7.5 7.5 0 0 1 15 0',
  lock:      'M6 10.5h12v10H6z M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5 M12 14.5v2.5',
  mail:      'M3 5.5h18v13H3z M3.5 6l8.5 7 8.5-7',
  biz:       'M4 20.5V5.5l7-2.5v4l9 3v10.5z M8 9h2 M8 12.5h2 M8 16h2 M14 13h2 M14 16.5h2',
  eye:       'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6',
  eyeOff:    'M3 3l18 18 M10.6 5.6A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8 M6.6 6.6C4 8.3 2.5 12 2.5 12S6 18.5 12 18.5a9.5 9.5 0 0 0 4.4-1.1 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  check:     'M4.5 12.5l5 5 10-11',
  alert:     'M12 3.5 22 20.5H2z M12 10v4.5 M12 17.6v.1',
  info:      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 11v5.5 M12 7.6v.1',
  okCircle:  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M8 12.3l2.8 2.8L16.3 9.5',
  globe:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M3 12h18 M12 3c2.5 2.7 3.6 5.7 3.6 9s-1.1 6.3-3.6 9c-2.5-2.7-3.6-5.7-3.6-9S9.5 5.7 12 3',
  arrow:     'M5 12h14 M13 6l6 6-6 6',
  bell:      'M6 8.5a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15 6 8.5 M10 20a2.2 2.2 0 0 0 4 0',
  search:    'M11 18.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15 M21 21l-4.6-4.6',
  chevDown:  'M6 9l6 6 6-6',
  chevRight: 'M9 6l6 6-6 6',
  menu:      'M3.5 6.5h17 M3.5 12h17 M3.5 17.5h17',
  sidebar:   'M3.5 4.5h17v15h-17z M9.5 4.5v15',
  logout:    'M15 4.5h4.5v15H15 M10 8l-4 4 4 4 M6 12h10',
  plus:      'M12 5v14 M5 12h14',
  refresh:   'M20 11.5a8 8 0 1 0-2.3 5.7 M20 5v6.5h-6.5',
  settings:  'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4 M19.4 13.5l1.6 1.2-1.8 3.1-1.9-.6a7.6 7.6 0 0 1-2 1.2l-.4 2H11l-.4-2a7.6 7.6 0 0 1-2-1.2l-1.9.6-1.8-3.1 1.6-1.2a7.8 7.8 0 0 1 0-2.9L4.9 9.3l1.8-3.1 1.9.6a7.6 7.6 0 0 1 2-1.2l.4-2h3.6l.4 2a7.6 7.6 0 0 1 2 1.2l1.9-.6 1.8 3.1-1.6 1.2a7.8 7.8 0 0 1 0 2.9z',
  trendUp:   'M3 17l6-6 4 4 8-8 M15 7h6v6',
  trendDown: 'M3 7l6 6 4-4 8 8 M15 17h6v-6',
  wallet:    'M3.5 7h15.5v12.5H5a1.5 1.5 0 0 1-1.5-1.5z M3.5 7V5.5A1.5 1.5 0 0 1 5 4h11v3 M15.5 13.5h.01',
  clock:     'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 7v5l3.2 2',
  file:      'M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6',
  x:         'M6 6l12 12 M18 6L6 18',
  keyboard:  'M3 6.5h18v11H3z M7 10h.01 M11 10h.01 M15 10h.01 M7 14h10',
};
export const Svg = ({ name, size = 18, stroke = 1.8, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={ICON_PATHS[name] || ICON_PATHS.file} /></svg>
);
