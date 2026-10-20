// Light / dark appearance. "system" follows the phone; the choice is a per-device
// convenience kept in localStorage (the app works the same without it).

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'theme';
const STATUS_BAR: Record<'light' | 'dark', string> = { light: '#f6f5f1', dark: '#161616' };

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Applies the preference to <html> and the browser status-bar colour. */
export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = STATUS_BAR[pref === 'system' ? scheme : pref];
  }
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Storage unavailable: the choice still applies until the app is closed.
  }
  applyTheme(pref);
}
