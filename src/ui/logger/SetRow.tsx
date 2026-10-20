import { useState } from 'react';
import type { SetLog } from '../../engine/model';
import type { Fields } from './fields';
import { NumberField } from './NumberField';

interface Props {
  set: SetLog;
  fields: Fields;
  onChange: (set: SetLog) => void;
  onRemove: (set: SetLog) => void;
}

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];

export function SetRow({ set, fields, onChange, onRemove }: Props) {
  const [more, setMore] = useState(false);
  const [watchStart, setWatchStart] = useState<number | null>(null);
  const patch = (p: Partial<SetLog>) => onChange({ ...set, ...p });

  function stopwatch() {
    if (watchStart === null) {
      setWatchStart(Date.now());
      return;
    }
    patch({ durationSec: Math.round((Date.now() - watchStart) / 1000) });
    setWatchStart(null);
  }

  return (
    <div className={`set ${set.completed ? 'done' : ''}`}>
      <div className="set-row">
        <span className="set-no">{set.setIndex}</span>
        {fields.weight && <NumberField key={`w${set.id}`} label="kg" value={set.weightKg} onCommit={(v) => patch({ weightKg: v })} />}
        {fields.assist && <NumberField key={`a${set.id}`} label="assist kg" value={set.assistKg} onCommit={(v) => patch({ assistKg: v })} />}
        {fields.reps && <NumberField key={`r${set.id}`} label="reps" integer value={set.reps} onCommit={(v) => patch({ reps: v })} />}
        {fields.seconds && (
          <NumberField key={`t${set.id}`} label="sec" integer value={set.durationSec} onCommit={(v) => patch({ durationSec: v })} />
        )}
        {fields.seconds && (
          <button type="button" className={`icon ${watchStart !== null ? 'running' : ''}`} onClick={stopwatch} aria-label={watchStart === null ? 'Start stopwatch' : 'Stop stopwatch'}>
            {watchStart === null ? '⏱' : '■'}
          </button>
        )}
        {fields.minutes && (
          <NumberField
            key={`m${set.id}`}
            label="min"
            value={set.durationSec == null ? null : Math.round(set.durationSec / 6) / 10}
            onCommit={(v) => patch({ durationSec: v === null ? null : Math.round(v * 60) })}
          />
        )}
        {fields.distance && <NumberField key={`d${set.id}`} label="m" value={set.distanceM} onCommit={(v) => patch({ distanceM: v })} />}
        {fields.rir && (
          <label className="num">
            <span>RIR</span>
            <select
              value={set.rir ? String(set.rir.max) : ''}
              onChange={(e) => patch({ rir: e.target.value === '' ? null : { min: Number(e.target.value), max: Number(e.target.value) } })}
              aria-label="RIR"
            >
              <option value="">–</option>
              {RIR_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={`check ${set.completed ? 'on' : ''}`}
          onClick={() => patch({ completed: !set.completed })}
          aria-pressed={set.completed}
          aria-label={set.completed ? `Set ${set.setIndex} done` : `Mark set ${set.setIndex} done`}
        >
          ✓
        </button>
        <button type="button" className="icon" onClick={() => setMore(!more)} aria-label="More options" aria-expanded={more}>⋯</button>
      </div>

      {(fields.tempo !== null || fields.pause) && (
        <label className="flag">
          <input
            type="checkbox"
            checked={(fields.tempo !== null ? set.tempoMet : set.pauseHeld) === true}
            onChange={(e) => patch(fields.tempo !== null ? { tempoMet: e.target.checked } : { pauseHeld: e.target.checked })}
          />
          {fields.tempo !== null ? `Every rep a full ${fields.tempo} s` : '1 s pause held on every rep'}
        </label>
      )}

      {more && (
        <div className="set-more">
          <label className="flag">
            <input type="checkbox" checked={set.techniqueOk === false} onChange={(e) => patch({ techniqueOk: e.target.checked ? false : true })} />
            Form broke down (reps don't count)
          </label>
          <input className="note" type="text" placeholder="Note for this set" value={set.notes ?? ''} onChange={(e) => patch({ notes: e.target.value || undefined })} />
          <button type="button" className="link danger" onClick={() => onRemove(set)}>Remove set</button>
        </div>
      )}
    </div>
  );
}
