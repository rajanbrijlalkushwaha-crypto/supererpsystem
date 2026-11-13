import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { preloadPrintFont } from './utils/printFont';
import { initUiScale } from './utils/uiScale';
import { initAppBridge } from './appBridge';

// Inside the Android app: keep its login, hide the desktop menus (does nothing on the desktop).
initAppBridge();

// Size the whole app to the screen (smaller on laptops) before the first paint.
initUiScale();

// Cache the print font up front so print windows can embed it synchronously.
preloadPrintFont();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
