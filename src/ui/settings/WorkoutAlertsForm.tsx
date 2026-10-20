import { useState } from 'react';
import { alertRestOver, canKeepAwake, canNotify, canVibrate, enableNotifications, loadRestPrefs, primeAudio, saveRestPrefs, type RestPrefs } from '../rest/alerts';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Keep-awake, sound, vibration and notification settings for the rest timer. */
export function WorkoutAlertsForm() {
  const [prefs, setPrefs] = useState<RestPrefs>(loadRestPrefs);
  const [note, setNote] = useState<string | null>(null);
  const set = (p: Partial<RestPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    saveRestPrefs(next);
  };
  const permission = canNotify() ? Notification.permission : 'unsupported';

  async function toggleNotify(on: boolean) {
    if (!on) return set({ notify: false });
    const ok = await enableNotifications();
    setPrefs(loadRestPrefs());
    setNote(ok ? null : 'Notifications are blocked for this app. Allow them in your phone or browser settings, then try again.');
  }

  async function test() {
    primeAudio();
    setNote('Testing in 3 seconds. Switch to another app to see the notification.');
    setTimeout(() => void alertRestOver('Test: this is how the end of a rest feels.', prefs.notify).then(() => setNote(null)), 3000);
  }

  return (
    <div className="form">
      {canKeepAwake() && (
        <label className="flag goal">
          <input type="checkbox" checked={prefs.keepAwake} onChange={(e) => set({ keepAwake: e.target.checked })} />
          <span>Keep the screen on during a workout <span className="muted small">(the most reliable way to never miss the end of a rest; uses a little more battery)</span></span>
        </label>
      )}
      <label className="flag goal">
        <input type="checkbox" checked={prefs.sound} onChange={(e) => set({ sound: e.target.checked })} />
        <span>Beep when the rest is over</span>
      </label>
      {canVibrate() && (
        <label className="flag goal">
          <input type="checkbox" checked={prefs.vibrate} onChange={(e) => set({ vibrate: e.target.checked })} />
          <span>Vibrate when the rest is over</span>
        </label>
      )}
      {canNotify() ? (
        <label className="flag goal">
          <input type="checkbox" checked={prefs.notify && permission === 'granted'} onChange={(e) => void toggleNotify(e.target.checked)} />
          <span>
            Notification when you are in another app
            {permission === 'denied' && <span className="muted small"> (blocked in settings)</span>}
          </span>
        </label>
      ) : (
        <p className="muted small">{isIos() ? 'Notifications need the app installed on your Home Screen (iOS 16.4 or newer).' : 'This browser cannot show notifications.'}</p>
      )}
      {isIos() && <p className="muted small">iPhones pause web apps while the screen is locked, so keep the screen on for the rest timer.</p>}
      {note && <p className="notice warn small">{note}</p>}
      <button type="button" className="secondary" onClick={() => void test()}>Test the alert</button>
    </div>
  );
}
