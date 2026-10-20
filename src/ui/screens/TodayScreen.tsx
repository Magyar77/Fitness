import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDb } from '../../data/db';
import { customWorkouts } from '../../data/custom';
import { pendingDecisions } from '../../data/recommendations';
import { currentProgram, inProgressSession, startSession } from '../../data/workouts';
import type { DecisionRecord } from '../../engine/progression';
import { weekStart } from '../../engine/dates';
import type { ProgramVersion, WeekPlan, WorkoutSession, WorkoutTemplate } from '../../engine/model';
import { clock, niceDate, today } from '../dates';
import { Dashboard } from './Dashboard';

interface State {
  program: ProgramVersion;
  open: WorkoutSession | undefined;
  plan: WeekPlan | undefined;
  pending: DecisionRecord[];
  /** Your workouts, including archived ones (so planned/done entries still resolve). */
  mine: WorkoutTemplate[];
}

const label = (t: WorkoutTemplate) => (t.kind === 'program' ? `${t.code} · ${t.name}` : t.name);

export function TodayScreen() {
  const db = getDb();
  const navigate = useNavigate();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const date = today();

  useEffect(() => {
    let alive = true;
    Promise.all([currentProgram(db), inProgressSession(db), db.weekPlans.get(weekStart(date)), pendingDecisions(db), customWorkouts(db, true)])
      .then(([program, open, plan, pending, mine]) => alive && setState({ program, open, plan, pending, mine }))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [db, date]);

  async function start(t: WorkoutTemplate) {
    if (!state) return;
    try {
      const id = await startSession(db, t, t.kind === 'program' ? state.program.id : null, date);
      navigate(`/session/${id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) return <section className="screen"><h1>Today</h1><p className="notice error">{error}</p></section>;
  if (!state) return <section className="screen"><h1>Today</h1><p className="muted">Loading…</p></section>;

  const { program, open, plan, pending, mine } = state;
  const all = [...program.templates, ...mine];
  const slotName = new Map(all.flatMap((t) => t.slots).map((s) => [s.slotKey, s.name]));
  const byCode = new Map(all.map((t) => [t.code, t]));
  const todays = plan?.entries.filter((e) => e.date === date && e.state !== 'skipped') ?? [];
  const isRest = plan?.restDays.includes(date);
  const openTemplate = open ? byCode.get(open.templateCode ?? '') : undefined;
  const startable = [...program.templates, ...mine.filter((m) => !m.archived)];

  return (
    <section className="screen">
      <h1>Today</h1>
      <p className="muted">{niceDate(date)}</p>

      {pending.length > 0 && (
        <div className="card highlight">
          <h2>{pending.length === 1 ? '1 change needs your OK' : `${pending.length} changes need your OK`}</h2>
          <ul className="pending-list">
            {pending.map((d) => (
              <li key={d.id}>
                <a href={`#/session/${d.basisSessionId}`}>{slotName.get(d.slotKey) ?? d.slotKey}</a>
                <span className="muted small"> · {d.next?.text ?? 'review'}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Until you decide, the current targets stay.</p>
        </div>
      )}

      {open && (
        <div className="card highlight">
          <h2>Workout in progress</h2>
          <p>
            {openTemplate ? label(openTemplate) : open.templateCode}
            <br />
            <span className="muted">{niceDate(open.date)}, started {clock(open.startedAt)}</span>
          </p>
          <button type="button" onClick={() => navigate(`/session/${open.id}`)}>Resume</button>
        </div>
      )}

      {!open && todays.map((e, i) => {
        const t = byCode.get(e.templateCode);
        if (!t) return null;
        return (
          <div className="card highlight" key={`${e.templateCode}${i}`}>
            <h2>{e.state === 'done' ? 'Done today' : 'Planned for today'}</h2>
            <p>
              <strong>{label(t)}</strong>
              <br />
              <span className="muted">{t.focus}{t.estMinutes ? ` · ~${t.estMinutes} min` : ''}</span>
            </p>
            {e.state === 'done' && e.sessionId ? (
              <button type="button" className="secondary" onClick={() => navigate(`/session/${e.sessionId}`)}>View workout</button>
            ) : (
              <button type="button" onClick={() => void start(t)}>Start {t.kind === 'program' ? t.code : t.name}</button>
            )}
          </div>
        );
      })}

      {!open && !todays.length && isRest && (
        <div className="card"><h2>Rest day</h2><p className="muted">You planned rest today. An easy walk or ride is fine.</p></div>
      )}

      <Dashboard date={date} templates={byCode} pending={pending.length} />

      <div className="card">
        <h2>{open ? 'Other workouts' : todays.length ? 'Or start another workout' : 'Start a workout'}</h2>
        {open && <p className="muted">Finish or discard the workout in progress before starting another.</p>}
        <div className="workout-list">
          {startable.map((t) => (
            <button key={t.code} type="button" className="secondary workout-button" disabled={!!open} onClick={() => void start(t)} aria-label={`Start ${label(t)}`}>
              <span className="code">{t.kind === 'program' ? t.code : '+'}</span>
              <span>
                {t.name}
                <small>{t.kind === 'program' ? t.focus : `Your workout · ${t.slots.length} exercises`}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
