import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDb } from '../../data/db';
import { currentProgram, inProgressSession, startSession } from '../../data/workouts';
import { weekStart } from '../../engine/dates';
import type { ProgramVersion, WeekPlan, WorkoutSession, WorkoutTemplate } from '../../engine/model';
import { clock, niceDate, today } from '../dates';

interface State {
  program: ProgramVersion;
  open: WorkoutSession | undefined;
  plan: WeekPlan | undefined;
}

export function TodayScreen() {
  const db = getDb();
  const navigate = useNavigate();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const date = today();

  useEffect(() => {
    let alive = true;
    Promise.all([currentProgram(db), inProgressSession(db), db.weekPlans.get(weekStart(date))])
      .then(([program, open, plan]) => alive && setState({ program, open, plan }))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [db, date]);

  async function start(t: WorkoutTemplate) {
    if (!state) return;
    try {
      const id = await startSession(db, t, state.program.id, date);
      navigate(`/session/${id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) return <section className="screen"><h1>Today</h1><p className="notice error">{error}</p></section>;
  if (!state) return <section className="screen"><h1>Today</h1><p className="muted">Loading…</p></section>;

  const { program, open, plan } = state;
  const byCode = new Map(program.templates.map((t) => [t.code, t]));
  const todays = plan?.entries.filter((e) => e.date === date && e.state !== 'skipped') ?? [];
  const isRest = plan?.restDays.includes(date);

  return (
    <section className="screen">
      <h1>Today</h1>
      <p className="muted">{niceDate(date)}</p>

      {open && (
        <div className="card highlight">
          <h2>Workout in progress</h2>
          <p>
            {open.templateCode} · {byCode.get(open.templateCode ?? '')?.name ?? ''}
            <br />
            <span className="muted">{niceDate(open.date)}, started {clock(open.startedAt)}</span>
          </p>
          <button type="button" onClick={() => navigate(`/session/${open.id}`)}>Resume</button>
        </div>
      )}

      {!open && todays.map((e) => {
        const t = byCode.get(e.templateCode);
        if (!t) return null;
        return (
          <div className="card highlight" key={e.templateCode}>
            <h2>{e.state === 'done' ? 'Done today' : 'Planned for today'}</h2>
            <p>
              <strong>{t.code} · {t.name}</strong>
              <br />
              <span className="muted">{t.focus}{t.estMinutes ? ` · ~${t.estMinutes} min` : ''}</span>
            </p>
            {e.state === 'done' && e.sessionId ? (
              <button type="button" className="secondary" onClick={() => navigate(`/session/${e.sessionId}`)}>View workout</button>
            ) : (
              <button type="button" onClick={() => void start(t)}>Start {t.code}</button>
            )}
          </div>
        );
      })}

      {!open && !todays.length && isRest && (
        <div className="card"><h2>Rest day</h2><p className="muted">You planned rest today. An easy walk or ride is fine.</p></div>
      )}

      <div className="card">
        <h2>{open ? 'Other workouts' : todays.length ? 'Or start another workout' : 'Start a workout'}</h2>
        {open && <p className="muted">Finish or discard the workout in progress before starting another.</p>}
        <div className="workout-list">
          {program.templates.map((t) => (
            <button key={t.code} type="button" className="secondary workout-button" disabled={!!open} onClick={() => void start(t)} aria-label={`Start ${t.code}: ${t.name}`}>
              <span className="code">{t.code}</span>
              <span>
                {t.name}
                <small>{t.focus}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
