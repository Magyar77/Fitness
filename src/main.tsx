import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ensureSeeded, getDb } from './data/db';
import { requestPersistence } from './data/storage';
import './ui/styles.css';

void ensureSeeded(getDb());
void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
