import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDb } from '../../data/db';
import { allExercises, customWorkouts, saveWorkout } from '../../data/custom';
import { unitOf } from '../../engine/custom';
import type { Exercise } from '../../engine/model';
import { buildFromOptions, FOCUS_LABEL, SETUP_HELP, SETUP_LABEL, swapSlot, targetsFor, toWorkoutDraft, type BuildOptions, type Built, type Focus, type Job, type Level, type Setup } from '../../engine/library/builder';
import { BODY_PARTS, type BodyPart } from '../../engine/library/groups';
import { today } from '../dates';
import { ExerciseBrowser } from '../library/ExerciseBrowser';
import { ExerciseDetail } from '../library/ExerciseDetail';

const FOCUSES: Focus[] = ['full', 'upper', 'lower', 'push', 'pull', 'arms', 'core', 'parts'];
const SETUPS: Setup[] = ['gym', 'dumbbells', 'bodyweight', 'bands'];
const LEVELS: { id: Level; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'expert', label: 'Advanced' },
];
const KEY = 'builder-options';
const DEFAULTS: BuildOptions = { focus: 'upper', parts: ['chest', 'back'], setup: 'gym', minutes: 45, level: 'intermediate', variant: 0 };

function loadOptions(): BuildOptions {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<BuildOptions>), variant: 0 };
  } catch {
    return DEFAULTS;
  }
}

function Segmented<T extends string | number>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={String(o.id)} type="button" className={value === o.id ? '' : 'secondary'} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pick a focus, equipment, time and level; the app assembles a workout you can tweak and save. */
export function BuilderScreen() {
  const db = getDb();
  const navigate = useNavigate();
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [options, setOptions] = useState<BuildOptions>(loadOptions);
  const [edits, setEdits] = useState<Built | null>(null); // swaps, removals and additions on top of the generated workout
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    allExercises(db).then((list) => {
      if (alive) setExercises(list);
    });
    return () => {
      alive = false;
    };
  }, [db]);

  const generated = useMemo(() => (exercises ? buildFromOptions(exercises, options) : null), [exercises, options]);
  if (!exercises || !generated) return <section className="screen"><p className="muted">Loading…</p></section>;
  const built = edits ?? generated;

  const change = (p: Partial<BuildOptions>) => {
    const next = { ...options, variant: 0, ...p };
    setOptions(next);
    setEdits(null);
    setOpen(null);
    setProblems([]);
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...next, variant: undefined }));
    } catch {
      // remembering the choice is only a convenience
    }
  };
  const togglePart = (p: BodyPart) => {
    const parts = options.parts ?? [];
    change({ parts: parts.includes(p) ? parts.filter((x) => x !== p) : [...parts, p] });
  };
  const remove = (i: number) => {
    setEdits({ ...built, slots: built.slots.filter((_, j) => j !== i) });
    setOpen(null);
  };
  const add = (e: Exercise) => {
    const job: Job = { id: 'added', label: 'Added by you', patterns: e.pattern ? [e.pattern] : [], muscles: e.muscles?.slice(0, 1) ?? [], compound: false };
    setEdits({ ...built, slots: [...built.slots, { job, exercise: e, draft: targetsFor(e, job, options.level) }] });
    setAdding(false);
  };

  async function uniqueName(name: string) {
    const taken = new Set((await customWorkouts(db)).map((t) => t.name.trim().toLowerCase()));
    let n = name;
    for (let i = 2; taken.has(n.toLowerCase()); i++) n = `${name} ${i}`;
    return n;
  }

  async function save() {
    const draft = toWorkoutDraft(built);
    const r = await saveWorkout(db, { ...draft, name: await uniqueName(draft.name) }, today());
    if (!r.ok) return setProblems(r.problems);
    navigate('/log');
  }

  async function fineTune() {
    const draft = toWorkoutDraft(built);
    navigate('/workouts/new', { state: { draft: { ...draft, name: await uniqueName(draft.name) } } });
  }

  const partsMissing = options.focus === 'parts' && !(options.parts ?? []).length;

  return (
    <section className="screen builder">
      <Link to="/log" className="back">← Workouts</Link>
      <h1>Build a workout</h1>
      <p className="muted small">Pick what to train; the app chooses the exercises. Big lifts come first, then smaller muscles, then core.</p>

      <div className="card form">
        <fieldset className="field">
          <legend>What do you want to train?</legend>
          <div className="chips">
            {FOCUSES.map((f) => (
              <button key={f} type="button" className="secondary chip" aria-pressed={options.focus === f} onClick={() => change({ focus: f })}>
                {f === 'parts' ? 'Choose body parts' : FOCUS_LABEL[f]}
              </button>
            ))}
          </div>
        </fieldset>
        {options.focus === 'parts' && (
          <fieldset className="field">
            <legend>Body parts (in order of priority)</legend>
            <div className="chips">
              {BODY_PARTS.map((b) => (
                <button key={b.id} type="button" className="secondary chip" aria-pressed={(options.parts ?? []).includes(b.id)} onClick={() => togglePart(b.id)}>
                  {b.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <label className="field">
          <span>Equipment</span>
          <select value={options.setup} onChange={(e) => change({ setup: e.target.value as Setup })}>
            {SETUPS.map((s) => <option key={s} value={s}>{SETUP_LABEL[s]}</option>)}
          </select>
          <span className="muted small">{SETUP_HELP[options.setup]}</span>
        </label>
        <fieldset className="field">
          <legend>Time</legend>
          <Segmented options={[{ id: 30 as const, label: '30 min' }, { id: 45 as const, label: '45 min' }, { id: 60 as const, label: '60 min' }]} value={options.minutes} onChange={(minutes) => change({ minutes })} />
        </fieldset>
        <fieldset className="field">
          <legend>Experience</legend>
          <Segmented options={LEVELS} value={options.level} onChange={(level) => change({ level })} />
        </fieldset>
      </div>

      {partsMissing ? (
        <p className="notice warn">Choose at least one body part.</p>
      ) : (
        <div className="card">
          <div className="built-head">
            <h2>{built.name}</h2>
            <button type="button" className="link" onClick={() => change({ variant: (options.variant ?? 0) + 1 })}>Shuffle</button>
          </div>
          {built.skipped.length > 0 && !edits && (
            <p className="muted small">
              Nothing fits {[...new Set(built.skipped.map((j) => j.label.toLowerCase()))].join(', ')} with this equipment and level, so {built.skipped.length === 1 ? 'it was' : 'they were'} left out.
            </p>
          )}
          <ol className="built-list">
            {built.slots.map((s, i) => (
              <li key={`${s.exercise.id}-${i}`}>
                <div className="built-row">
                  <button type="button" className="library-name" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                    <span>{s.exercise.name}</span>
                    <small>
                      {s.job.label} · {s.draft.sets} × {s.draft.min}–{s.draft.max} {unitOf(s.exercise)}
                      {s.exercise.perSide ? ` per ${s.exercise.perSide}` : ''}
                    </small>
                  </button>
                  <button type="button" className="icon" onClick={() => { setEdits(swapSlot(exercises, built, i, options)); setOpen(null); }} aria-label={`Swap ${s.exercise.name}`} title="Swap for another exercise">⇄</button>
                  <button type="button" className="icon" onClick={() => remove(i)} aria-label={`Remove ${s.exercise.name}`}>✕</button>
                </div>
                {open === i && <ExerciseDetail exercise={s.exercise} />}
              </li>
            ))}
          </ol>
          {adding ? (
            <div className="picker">
              <ExerciseBrowser exercises={exercises} onPick={add} />
              <button type="button" className="link" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          ) : (
            <button type="button" className="secondary wide" onClick={() => setAdding(true)}>+ Add exercise</button>
          )}
          {problems.length > 0 && <p className="notice error">{problems.join('\n')}</p>}
          <div className="buttons">
            <button type="button" onClick={() => void save()} disabled={!built.slots.length}>Save workout</button>
            <button type="button" className="secondary" onClick={() => void fineTune()} disabled={!built.slots.length}>Adjust sets and reps</button>
          </div>
          <p className="muted small">Saved workouts appear under Workouts; start them any day or add them to your week.</p>
        </div>
      )}
    </section>
  );
}
