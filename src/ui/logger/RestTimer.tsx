import { useEffect, useRef, useState } from 'react';

interface Props {
  endsAt: number | null;
  onChange: (endsAt: number | null) => void;
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Bar above the tab bar counting down the rest after a completed set. */
export function RestTimer({ endsAt, onChange }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const buzzed = useRef<number | null>(null);

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endsAt && buzzed.current !== endsAt) {
        buzzed.current = endsAt;
        navigator.vibrate?.([200, 100, 200]);
      }
    }, 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (endsAt === null) return null;
  const left = endsAt - now;
  return (
    <div className={`rest-bar ${left <= 0 ? 'over' : ''}`} role="timer" aria-live="polite">
      <span>{left > 0 ? `Rest ${mmss(left)}` : 'Rest over: next set'}</span>
      <div className="buttons">
        {left > 0 && <button type="button" className="secondary" onClick={() => onChange(endsAt + 30_000)}>+30 s</button>}
        <button type="button" className="secondary" onClick={() => onChange(null)}>{left > 0 ? 'Skip' : 'Close'}</button>
      </div>
    </div>
  );
}
