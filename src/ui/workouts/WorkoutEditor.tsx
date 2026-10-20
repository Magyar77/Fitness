import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getDb } from '../../data/db';
import { allExercises, draftOf, saveWorkout } from '../../data/custom';
import { saveProgramWorkout } from '../../data/programs';
import { currentProgram } from '../../data/workouts';
import { defaultSlot, unitOf, validateWorkout, type SlotDraft, type WorkoutDraft } from '../../engine/custom';
import type { Demand, Exercise, WorkoutTemplate } from '../../engine/model';
import { NumberField } from '../logger/NumberField';
import { today } from '../dates';
import { ExerciseForm } from './ExerciseForm';
import { ExerciseBrowser } from '../library/ExerciseBrowser';
import { useBar, useUnit } from '../profile';
import { isPlatesBarbell, shownLoad, storedLoad } from '../../engine/units';

const DEMANDS: { value: Demand; label: string; help: string }[] = [
  { value: 'easy', label: 'Easy', help: 'Recovery-level effort' },
  { value: 'moderate', label: 'Moderate', help: 'A normal training session' },
  { value: 'hard', label: 'Hard', help: 'Leaves you tired the next day' },
];

const EMPTY: WorkoutDraft = { name: '', demand: 'moderate', notes: '', slots: [] };

/** `custom`: your extra workouts. `program`: a workout of your active program (saves a new program version). */
export function WorkoutEditor({ mode = 'custom' }: { mode?: 'custom' | 'program' }) {
  const { code } = useParams();
  const isNew = !code || code === 'new';
  const db = getDb();
  const weightUnit = useUnit();
  const bar = useBar();
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [existing, setExisting] = useState<WorkoutTemplate | undefined>(undefined);
  const [draft, setDraft] = useState<WorkoutDraft>(EMPTY);
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await allExercises(db);
      const t = isNew
        ? undefined
        : mode === 'program'
          ? (await currentProgram(db)).templates.find((x) => x.code === code)
          : await db.templates.where('code').equals(code!).first();
      const d = t ? await draftOf(db, t, today()) : EMPTY;
      return { list, t, d };
    })().then(({ list, t, d }) => {
      if (!alive) return;
      setExercises(list);
      setExisting(t);
      setDraft(d);
    });
    return () => {
      alive = false;
    };
  }, [db, code, isNew, mode]);

  if (!exercises) return <section className="screen"><p className="muted">Loading…</p></section>;
  if (!isNew && !existing) return <section className="screen"><p className="notice error">Workout not found.</p><Link to="/log">← Workouts</Link></section>;

  const byId = new Map(exercises.map((e) => [e.id, e]));
  const setSlot = (i: number, p: Partial<SlotDraft>) => setDraft({ ...draft, slots: draft.slots.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const move = (i: number, by: number) => {
    const slots = [...draft.slots];
    const [s] = slots.splice(i, 1);
    slots.splice(i + by, 0, s!);
    setDraft({ ...draft, slots: slots.map((x, j) => (j === 0 ? { ...x, supersetWithPrevious: false } : x)) });
  };
  const remove = (i: number) => setDraft({ ...draft, slots: draft.slots.filter((_, j) => j !== i).map((x, j) => (j === 0 ? { ...x, supersetWithPrevious: false } : x)) });
  const add = (e: Exercise) => {
    setDraft({ ...draft, slots: [...draft.slots, defaultSlot(e)] });
    setPicking(false);
    setCreating(false);
    setSearch('');
  };

  async function save() {
    const check = validateWorkout(draft, byId, []);
    if (check.length) return setProblems(check);
    const r = mode === 'program' ? await saveProgramWorkout(db, draft, today(), existing?.code) : await saveWorkout(db, draft, today(), existing);
    if (!r.ok) return setProblems(r.problems);
    navigate('/log');
  }

  return (
    <section className="screen editor">
      <Link to="/log" className="back">← Workouts</Link>
      <h1>{isNew ? (mode === 'program' ? 'New program workout' : 'New workout') : `Edit ${existing!.name}`}</h1>
      <p className="muted small">
        {mode === 'program'
          ? 'Saving creates a new version of your program; past workouts keep the version they used.'
          : 'Your own workouts never change the original program.'}
      </p>

      <div className="card form">
        <label className="field">
          <span>Name</span>
          <input type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Arms and core" />
        </label>
        <fieldset className="field">
          <legend>How demanding?</legend>
          <div className="segmented">
            {DEMANDS.map((d) => (
              <button key={d.value} type="button" className={draft.demand === d.value ? '' : 'secondary'} aria-pressed={draft.demand === d.value} onClick={() => setDraft({ ...draft, demand: d.value })}>
                {d.label}
              </button>
            ))}
          </div>
          <span className="muted small">{DEMANDS.find((d) => d.value === draft.demand)!.help}. Used to warn about hard days in a row.</span>
        </fieldset>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea rows={2} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
        </label>
      </div>

      {draft.slots.map((s, i) => {
        const e = byId.get(s.exerciseId);
        if (!e) return null;
        const unit = unitOf(e);
        const loadLabel = e.loadType === 'assisted_machine' ? `start assist ${weightUnit}` : `start ${weightUnit}${isPlatesBarbell(e) ? (bar ? ' total' : ' plates') : ''}`;
        const hasLoad = !['bodyweight', 'cardio'].includes(e.loadType);
        return (
          <article key={`${s.slotKey}-${i}`} className="card slot-edit">
            <header>
              <h2>{i + 1}. {e.name}{e.perSide && <span className="badge">per {e.perSide}</span>}</h2>
              <div className="reorder">
                <button type="button" className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${e.name} up`}>↑</button>
                <button type="button" className="icon" disabled={i === draft.slots.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${e.name} down`}>↓</button>
                <button type="button" className="icon" onClick={() => remove(i)} aria-label={`Remove ${e.name}`}>✕</button>
              </div>
            </header>
            <div className="set-row">
              {e.measure !== 'duration' && <NumberField label="sets" integer value={s.sets} onCommit={(v) => setSlot(i, { sets: v ?? 0 })} />}
              {!(e.measure === 'time' && s.maxEffort) && <NumberField label={`min ${unit}`} integer={e.measure === 'reps'} value={s.min} onCommit={(v) => setSlot(i, { min: v ?? 0 })} />}
              {!(e.measure === 'time' && s.maxEffort) && <NumberField label={`max ${unit}`} integer={e.measure === 'reps'} value={s.max} onCommit={(v) => setSlot(i, { max: v ?? 0 })} />}
              {hasLoad && <NumberField label={loadLabel} value={s.targetKg === null ? null : shownLoad(s.targetKg, e, bar, weightUnit)} onCommit={(v) => setSlot(i, { targetKg: v === null ? null : storedLoad(v, e, bar, weightUnit) })} />}
            </div>
            <div className="set-row">
              {e.measure === 'reps' && <NumberField label="RIR from" integer value={s.rirMin} onCommit={(v) => setSlot(i, { rirMin: v })} />}
              {e.measure === 'reps' && <NumberField label="RIR to" integer value={s.rirMax} onCommit={(v) => setSlot(i, { rirMax: v })} />}
              {e.measure !== 'duration' && <NumberField label="rest from (s)" integer value={s.restMin} onCommit={(v) => setSlot(i, { restMin: v })} />}
              {e.measure !== 'duration' && <NumberField label="rest to (s)" integer value={s.restMax} onCommit={(v) => setSlot(i, { restMax: v })} />}
            </div>
            {e.measure === 'time' && (
              <label className="flag">
                <input type="checkbox" checked={!!s.maxEffort} onChange={(ev) => setSlot(i, { maxEffort: ev.target.checked })} />
                Max hold: as long as you can (target = beat your best)
              </label>
            )}
            <input className="note" type="text" placeholder="Notes for this exercise (optional)" value={s.notes} onChange={(ev) => setSlot(i, { notes: ev.target.value })} />
            {i > 0 && (
              <label className="flag">
                <input type="checkbox" checked={s.supersetWithPrevious} onChange={(ev) => setSlot(i, { supersetWithPrevious: ev.target.checked })} />
                Superset with the exercise above
              </label>
            )}
          </article>
        );
      })}

      {creating ? (
        <ExerciseForm initialName={search} onSaved={(e) => { setExercises([...exercises, e]); add(e); }} onCancel={() => setCreating(false)} />
      ) : picking ? (
        <div className="card picker">
          <ExerciseBrowser exercises={exercises} onPick={add} initialQuery={search} onQueryChange={setSearch} />
          <div className="buttons">
            <button type="button" className="secondary" onClick={() => setCreating(true)}>Create a new exercise</button>
            <button type="button" className="link" onClick={() => setPicking(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="secondary wide" onClick={() => setPicking(true)}>+ Add exercise</button>
      )}

      {problems.length > 0 && <p className="notice error">{problems.join('\n')}</p>}
      <div className="buttons sticky-actions">
        <button type="button" onClick={() => void save()}>Save workout</button>
        <Link to="/log" className="link-button">Cancel</Link>
      </div>
    </section>
  );
}
