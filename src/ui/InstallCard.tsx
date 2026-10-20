import { useEffect, useState } from 'react';
import { canPromptInstall, isInstalled, onInstallChange, promptInstall } from './install';

/**
 * "Install on this phone": a real install button when the browser allows it,
 * otherwise short steps for the common Android browsers. Hidden once installed.
 * `compact` shows only the button (for the Today screen).
 */
export function InstallCard({ compact = false }: { compact?: boolean }) {
  const [, rerender] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => onInstallChange(() => rerender((n) => n + 1)), []);

  if (isInstalled()) return compact ? null : <p className="muted small">Installed on this device ✓</p>;
  const available = canPromptInstall();
  if (compact && !available && !result) return null;
  if (compact && !available) return <p className="notice ok small">{result}</p>;

  async function install() {
    const outcome = await promptInstall();
    setResult(outcome === 'accepted' ? 'Installing… open it from your home screen.' : outcome === 'dismissed' ? 'Install cancelled. You can try again any time.' : null);
  }

  return (
    <div className={compact ? 'card highlight' : ''}>
      {compact && <h2>Install the app</h2>}
      <p className="muted small">Installing puts it on your home screen, opens it full-screen and keeps it working offline.</p>
      {available ? (
        <button type="button" onClick={() => void install()}>Install app</button>
      ) : (
        <ul className="reasons small">
          <li><strong>Chrome:</strong> tap ⋮ (top right) → <em>Install app</em> or <em>Add to home screen</em>.</li>
          <li><strong>Samsung Internet:</strong> tap ☰ → <em>Add page to</em> → <em>Home screen</em>.</li>
          <li><strong>Firefox:</strong> tap ⋮ → <em>Install</em>.</li>
          <li>Opened from another app (mail, chat, Claude)? Tap ⋮ → <em>Open in Chrome</em> first; built-in mini browsers can't install apps.</li>
        </ul>
      )}
      {result && <p className="notice ok small">{result}</p>}
    </div>
  );
}
