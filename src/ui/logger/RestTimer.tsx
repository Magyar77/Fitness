import { useEffect, useState } from 'react';

interface Props {
  endsAt: number | null;
  onChange: (endsAt: number | null) => void;
  /** Offers to turn on notifications for the end of a rest. */
  onEnableAlerts?: () => void;
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Bar above the tab bar counting down the rest after a completed set. */
export function RestTimer({ endsAt, onChange, onEnableAlerts }: Props) {
  const [now, setNow] = useState(() => Date.now());

  // The beep, vibration and notification come from the rest alert (rest/alerts.ts).
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (endsAt === null) return null;
  const left = endsAt - now;
  return (
    <div className={`rest-bar ${left <= 0 ? 'over' : ''}`} role="timer" aria-live="polite">
      <span>{left > 0 ? `Rest ${mmss(left)}` : 'Rest over: next set'}</span>
      <div className="buttons">
        {left > 0 && onEnableAlerts && <button type="button" className="secondary" onClick={onEnableAlerts} title="Get a notification when the rest is over">Alert me</button>}
        {left > 0 && <button type="button" className="secondary" onClick={() => onChange(endsAt + 30_000)}>+30 s</button>}
        <button type="button" className="secondary" onClick={() => onChange(null)}>{left > 0 ? 'Skip' : 'Close'}</button>
      </div>
    </div>
  );
}
