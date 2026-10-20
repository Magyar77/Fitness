import { useState } from 'react';
import type { Discomfort, Exercise, SetLog, TemplateSlot } from '../../engine/model';
import { slotSummary } from '../../engine/logging';
import { fieldsFor, perSideLabel } from './fields';
import { SetRow } from './SetRow';
import { useBar, useUnit } from '../profile';
import { formatLoad, isPlatesBarbell } from '../../engine/units';
import { ExerciseDetail, muscleSummary } from '../library/ExerciseDetail';
import { ExerciseBrowser } from '../library/ExerciseBrowser';

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
  /** Set when another exercise was swapped in for this workout. */
  original?: Exercise;
  library: Exercise[];
  swapOptions: Exercise[];
  onSwap: (exerciseId: string | null) => void;
}

export function ExerciseCard({ slot, exercise, target, last, sets, discomfort, onChange, onAdd, onRemove, onDiscomfort, original, library, swapOptions, onSwap }: Props) {
  const unit = useUnit();
  const bar = useBar();
  const convention = isPlatesBarbell(exercise)
    ? bar
      ? `Total weight including the bar (${formatLoad(bar, unit)}).`
      : 'Plates only, bar not counted.'
    : exercise.loadConvention.replace('kg of assistance', `${unit} of assistance`);
  const [painOpen, setPainOpen] = useState(false);
  const [painNote, setPainNote] = useState('');
  const [panel, setPanel] = useState<'none' | 'howto' | 'swap' | 'search'>('none');
  const swapOpen = panel === 'swap' || panel === 'search';
  const pick = (id: string | null) => {
    onSwap(id);
    setPanel('none');
  };
  const hasHowTo = (exercise.images?.length ?? 0) > 0 || (exercise.instructions?.length ?? 0) > 0;
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
          {original ? exercise.name : slot.name}
          {original && <span className="badge">swapped</span>}
          {slot.supersetGroup && <span className="badge">superset</span>}
        </h2>
        <span className="muted count">{done}/{sets.length}</span>
      </header>
      {original && <p className="muted small">Instead of {slot.name}, for this workout only. Its targets stay as they are.</p>}
      <p className="target">{target}</p>
      {!original && target !== slotSummary(slot) && <p className="muted small">Program: {slotSummary(slot)}</p>}
      <p className="muted small">
        Last time: {last ? `${last.text} (${last.date})` : 'no record yet'}
      </p>
      {(exercise.cues.length > 0 || slot.notes.length > 0 || exercise.loadType !== 'bodyweight') && (
        <details className="small">
          <summary>Cues &amp; notes</summary>
          <ul>
            {slot.notes.map((n) => <li key={n}>{n}</li>)}
            {exercise.cues.map((c) => <li key={c}>{c}</li>)}
            {exercise.loadType !== 'bodyweight' && exercise.loadType !== 'cardio' && <li>{convention}</li>}
            {side && <li>Reps are {side}.</li>}
          </ul>
        </details>
      )}

      <div className="sets">
        {sets.map((s) => (
          <SetRow key={s.id} set={s} exercise={exercise} fields={fields} onChange={onChange} onRemove={onRemove} />
        ))}
      </div>

      {discomfort.map((d, i) => (
        <p key={i} className={`notice ${d.severity === 'sharp' ? 'error' : 'warn'} small`}>
          {d.severity === 'sharp' ? 'Sharp pain reported: stop this exercise and use an alternative.' : 'Discomfort reported.'}
          {d.note && ` "${d.note}"`}
          {d.severity === 'sharp' && !original && done === 0 && (
            <>
              {' '}
              <button type="button" className="link inline" onClick={() => setPanel('swap')}>Swap it</button>
            </>
          )}
        </p>
      ))}

      {panel === 'howto' && <ExerciseDetail exercise={exercise} />}
      {swapOpen && (
        <div className="swap-panel">
          {done > 0 ? (
            <p className="muted small">Untick the sets you already did to swap this exercise.</p>
          ) : panel === 'search' ? (
            <ExerciseBrowser exercises={library} onPick={(e) => pick(e.id)} />
          ) : (
            <>
              <p className="muted small">For this workout only, e.g. when the machine is taken. Same sets and reps.</p>
              <ul className="swap-list">
                {original && (
                  <li>
                    <button type="button" className="secondary" onClick={() => pick(null)}>
                      <span>Back to {original.name}</span>
                    </button>
                  </li>
                )}
                {swapOptions.filter((e) => e.id !== exercise.id).map((e) => (
                  <li key={e.id}>
                    <button type="button" className="secondary" onClick={() => pick(e.id)}>
                      <span>{e.name}</span>
                      <small>{muscleSummary(e)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {done === 0 && (
            <button type="button" className="link" onClick={() => setPanel(panel === 'search' ? 'swap' : 'search')}>
              {panel === 'search' ? 'Back to suggestions' : 'Search all exercises'}
            </button>
          )}
        </div>
      )}

      <div className="card-actions">
        <button type="button" className="link" onClick={onAdd}>+ Add set</button>
        {hasHowTo && <button type="button" className="link" aria-expanded={panel === 'howto'} onClick={() => setPanel(panel === 'howto' ? 'none' : 'howto')}>How to</button>}
        <button type="button" className="link" aria-expanded={swapOpen} onClick={() => setPanel(swapOpen ? 'none' : 'swap')}>Swap</button>
        <button type="button" className="link" onClick={() => setPainOpen(!painOpen)}>Discomfort</button>
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
