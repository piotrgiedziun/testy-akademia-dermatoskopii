import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './locales/i18n';

// A code-split chunk can disappear when a new version is deployed while this tab is open (its hashed
// name changes). Vite reports that as 'vite:preloadError': reload once to pick up the new version.
// The timestamp guard prevents a reload loop if the chunk is missing for another reason.
window.addEventListener('vite:preloadError', () => {
  try {
    const last = Number(sessionStorage.getItem('chunk-reload-at') || 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem('chunk-reload-at', String(Date.now()));
  } catch {
    // storage unavailable: reload anyway (at worst once per failure)
  }
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
