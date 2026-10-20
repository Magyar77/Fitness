import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ensureSeeded, getDb } from './data/db';
import { requestPersistence } from './data/storage';
import { captureInstallPrompt } from './ui/install';
import './ui/styles.css';

captureInstallPrompt();
void ensureSeeded(getDb());
void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
