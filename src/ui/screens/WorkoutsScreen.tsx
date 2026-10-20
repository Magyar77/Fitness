import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getDb } from '../../data/db';
import { allExercises, archiveWorkout, customWorkouts, duplicateWorkout, scheduleWorkout } from '../../data/custom';
import { inProgressSession, startSession } from '../../data/workouts';
import type { Exercise, WorkoutTemplate } from '../../engine/model';
import type { ScheduleWarning } from '../../engine/scheduling';
import { niceDate, today } from '../dates';
import { ProgramCard } from '../workouts/ProgramCard';

interface Loaded {
  mine: WorkoutTemplate[];
  exercises: Exercise[];
  busy: boolean; // a workout is in progress
}

type Message = { kind: 'ok' | 'error' | 'warn'; text: string } | null;

export function WorkoutsScreen() {
  const db = getDb();
  const navigate = useNavigate();
  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState<Message>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [date, setDate] = useState(today());

  useEffect(() => {
    let alive = true;
    Promise.all([customWorkouts(db), allExercises(db), inProgressSession(db)]).then(([mine, exercises, open]) => {
      if (alive) setData({ mine, exercises, busy: !!open });
    });
    return () => {
      alive = false;
    };
  }, [db, version]);

  if (!data) return <section className="screen"><h1>Workouts</h1><p className="muted">Loading…</p></section>;
  const names = new Map(data.exercises.map((e) => [e.id, e.name]));
  const refresh = () => setVersion((v) => v + 1);

  async function run(task: () => Promise<Message>) {
    try {
      setMessage(await task());
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
    refresh();
  }

  const start = (t: WorkoutTemplate) =>
    run(async () => {
      const id = await startSession(db, t, null, today());
      navigate(`/session/${id}`);
      return null;
    });

  const describe = (warnings: ScheduleWarning[], t: WorkoutTemplate): Message => {
    const serious = warnings.filter((w) => w.severity !== 'info');
    return serious.length
      ? { kind: 'warn', text: `${t.name} added on ${niceDate(date)}, but check this:\n${serious.map((w) => `• ${w.message}`).join('\n')}` }
      : { kind: 'ok', text: `${t.name} added on ${niceDate(date)}.` };
  };

  return (
    <section className="screen workouts">
      <h1>Workouts</h1>
      {message && <p className={`notice ${message.kind}`}>{message.text}</p>}

      <ProgramCard onChanged={refresh} />

      <div className="card">
        <h2>Extra workouts</h2>
        {data.mine.length === 0 && <p className="muted">Create extra workouts for days outside the program. They never change it.</p>}
        {data.mine.map((t) => (
          <div key={t.code} className="mine">
            <div className="mine-head">
              <strong>{t.name}</strong>
              <span className="muted small">{t.slots.length} exercise{t.slots.length === 1 ? '' : 's'} · {t.demand}</span>
            </div>
            <p className="muted small">{t.slots.map((s) => names.get(s.exerciseId) ?? s.name).join(' · ')}</p>
            <div className="buttons">
              <button type="button" onClick={() => void start(t)} disabled={data.busy}>Start</button>
              <button type="button" className="secondary" onClick={() => setScheduling(scheduling === t.code ? null : t.code)}>Schedule</button>
              <Link to={`/workouts/${t.code}`} className="link-button">Edit</Link>
              <button type="button" className="link" onClick={() => void run(async () => ({ kind: 'ok', text: `Created "${(await duplicateWorkout(db, t.code, today())).name}".` }))}>Duplicate</button>
              <button
                type="button"
                className="link danger"
                onClick={() => {
                  if (window.confirm(`Delete "${t.name}"? Past sessions of it are kept; future planned ones are removed.`)) {
                    void run(async () => {
                      await archiveWorkout(db, t.code, today());
                      return { kind: 'ok', text: `Deleted "${t.name}".` };
                    });
                  }
                }}
              >
                Delete
              </button>
            </div>
            {scheduling === t.code && (
              <div className="schedule">
                <label className="field">
                  <span>Day</span>
                  <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} />
                </label>
                <button type="button" onClick={() => void run(async () => { const w = await scheduleWorkout(db, t.code, date); setScheduling(null); return describe(w, t); })}>
                  Add to plan
                </button>
              </div>
            )}
          </div>
        ))}
        {data.busy && <p className="muted small">Finish the workout in progress before starting another.</p>}
        <div className="buttons">
          <Link to="/build" className="button-link primary">Build one for me</Link>
          <Link to="/workouts/new" className="button-link">+ New workout</Link>
        </div>
      </div>

      <div className="card">
        <h2>Exercise library</h2>
        <p className="muted small">
          {data.exercises.length} exercises: gym, street workout and bodyweight, grouped by body part, with photos and how-tos.
          {data.exercises.some((e) => e.custom) && ` Includes ${data.exercises.filter((e) => e.custom).length} of your own.`}
        </p>
        <Link to="/library" className="button-link">Browse exercises</Link>
      </div>
    </section>
  );
}
