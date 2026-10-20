import { useState } from 'react';
import type { Discomfort, Exercise, SetLog, TemplateSlot } from '../../engine/model';
import { slotSummary } from '../../engine/logging';
import { fieldsFor, perSideLabel } from './fields';
import { SetRow } from './SetRow';

interface Props {
  slot: TemplateSlot;
  exercise: Exercise;
  target: string;
  last: { date: string; text: string } | null;
  sets: SetLog[];
  discomfort: Discomfort[];
  onChange: (set: SetLog) => void;
  onAdd: () => void;
  onRemove: (set: SetLog) => void;
  onDiscomfort: (d: Discomfort) => void;
}

export function ExerciseCard({ slot, exercise, target, last, sets, discomfort, onChange, onAdd, onRemove, onDiscomfort }: Props) {
  const [painOpen, setPainOpen] = useState(false);
  const [painNote, setPainNote] = useState('');
  const fields = fieldsFor(slot, exercise, target);
  const done = sets.filter((s) => s.completed).length;
  const side = perSideLabel(slot);

  function report(severity: Discomfort['severity']) {
    onDiscomfort({ slotKey: slot.slotKey, severity, note: painNote.trim() });
    setPainOpen(false);
    setPainNote('');
  }

  return (
    <article className={`card exercise ${done === sets.length && sets.length ? 'complete' : ''}`}>
      <header>
        <h2>
          {slot.name}
          {slot.supersetGroup && <span className="badge">superset</span>}
        </h2>
        <span className="muted count">{done}/{sets.length}</span>
      </header>
      <p className="target">{target}</p>
      {target !== slotSummary(slot) && <p className="muted small">Program: {slotSummary(slot)}</p>}
      <p className="muted small">
        Last time: {last ? `${last.text} (${last.date})` : 'no record yet'}
      </p>
      {(exercise.cues.length > 0 || slot.notes.length > 0 || exercise.loadType !== 'bodyweight') && (
        <details className="small">
          <summary>Cues &amp; notes</summary>
          <ul>
            {slot.notes.map((n) => <li key={n}>{n}</li>)}
            {exercise.cues.map((c) => <li key={c}>{c}</li>)}
            {exercise.loadType !== 'bodyweight' && exercise.loadType !== 'cardio' && <li>{exercise.loadConvention}</li>}
            {side && <li>Reps are {side}.</li>}
          </ul>
        </details>
      )}

      <div className="sets">
        {sets.map((s) => (
          <SetRow key={s.id} set={s} fields={fields} onChange={onChange} onRemove={onRemove} />
        ))}
      </div>

      {discomfort.map((d, i) => (
        <p key={i} className={`notice ${d.severity === 'sharp' ? 'error' : 'warn'} small`}>
          {d.severity === 'sharp' ? 'Sharp pain reported: stop this exercise and use an alternative.' : 'Discomfort reported.'}
          {d.note && ` "${d.note}"`}
        </p>
      ))}

      <div className="card-actions">
        <button type="button" className="link" onClick={onAdd}>+ Add set</button>
        <button type="button" className="link" onClick={() => setPainOpen(!painOpen)}>Report discomfort</button>
      </div>
      {painOpen && (
        <div className="pain">
          <input type="text" placeholder="Where / what (optional)" value={painNote} onChange={(e) => setPainNote(e.target.value)} />
          <div className="buttons">
            <button type="button" className="secondary" onClick={() => report('mild')}>Mild discomfort</button>
            <button type="button" className="danger" onClick={() => report('sharp')}>Sharp or joint pain</button>
          </div>
        </div>
      )}
    </article>
  );
}
