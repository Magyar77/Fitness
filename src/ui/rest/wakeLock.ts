import { useEffect } from 'react';

/** Keeps the screen on while `enabled` (re-acquired when you come back to the app). */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const acquire = async () => {
      if (!alive || document.visibilityState !== 'visible' || (lock && !lock.released)) return;
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        // Battery saver or no permission: the screen just follows its normal timeout.
      }
    };
    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [enabled]);
}
