// Rest-over alerts: a beep and vibration while the app is open, a notification when the
// app is in the background. A module-level timer, so it keeps running when you leave the
// workout screen. Web limits: a phone may pause the page when the screen is off (iPhone
// always does), which is why "keep the screen on" exists too.

export interface RestPrefs {
  keepAwake: boolean;
  sound: boolean;
  vibrate: boolean;
  notify: boolean;
}

const KEY = 'rest-prefs';
const DEFAULTS: RestPrefs = { keepAwake: true, sound: true, vibrate: true, notify: false };

export function loadRestPrefs(): RestPrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<RestPrefs>) };
  } catch {
    return DEFAULTS;
  }
}

export function saveRestPrefs(p: RestPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Only a convenience; the defaults apply next time.
  }
}

export const canNotify = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
export const canKeepAwake = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;
export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

/** Asks for notification permission (must follow a tap). True when allowed. */
export async function enableNotifications(): Promise<boolean> {
  if (!canNotify()) return false;
  const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  const ok = result === 'granted';
  saveRestPrefs({ ...loadRestPrefs(), notify: ok });
  return ok;
}

// ---------------------------------------------------------------------------
// Sound: a short double beep. Browsers only allow audio after a tap, so the context is
// created on the first completed set and reused.

let audio: AudioContext | null = null;

export function primeAudio(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

function beep(): void {
  if (!audio) return;
  const t0 = audio.currentTime;
  for (const start of [0, 0.25]) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t0 + start);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + 0.2);
  }
}

// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | undefined;
let firedFor: number | null = null;

async function notify(body: string): Promise<void> {
  if (!canNotify() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Rest is over', {
    body,
    tag: 'rest',
    icon: 'icon-192.png',
    data: { url: location.href },
    // Newer fields some browsers understand; harmless elsewhere.
    ...({ renotify: true, vibrate: [300, 150, 300] } as object),
  });
}

/** Alerts now, the way the settings and the app's visibility allow. */
export async function alertRestOver(body: string, force = false): Promise<void> {
  const p = loadRestPrefs();
  const visible = document.visibilityState === 'visible';
  if (p.sound || force) beep();
  if ((p.vibrate || force) && canVibrate()) navigator.vibrate([300, 150, 300]);
  if ((!visible && p.notify) || force) await notify(body).catch(() => undefined);
}

/** Sets the alert for the end of a rest (replacing any earlier one). */
export function scheduleRestAlert(endsAt: number, body: string): void {
  cancelRestAlert();
  const wait = endsAt - Date.now();
  if (wait <= 0) return;
  timer = setTimeout(() => {
    if (firedFor === endsAt) return;
    firedFor = endsAt;
    void alertRestOver(body);
  }, wait);
}

export function cancelRestAlert(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
}

/** Clears a shown "rest is over" notification, e.g. when you are back in the app. */
export async function clearRestNotification(): Promise<void> {
  if (!canNotify()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  for (const n of (await reg?.getNotifications({ tag: 'rest' })) ?? []) n.close();
}
