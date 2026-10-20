import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ensureSeeded, getDb } from './data/db';
import { requestPersistence } from './data/storage';
import { captureInstallPrompt } from './ui/install';
import { applyTheme, getThemePref } from './ui/theme';
import './ui/styles.css';

applyTheme(getThemePref()); // before the first paint: no flash of the wrong theme
captureInstallPrompt();
void ensureSeeded(getDb());
void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
