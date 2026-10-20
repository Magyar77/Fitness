import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDb } from '../../data/db';
import { deleteBodyWeight, loadProgress, saveBodyWeight, type ProgressData } from '../../data/progress';
import { addDays } from '../../engine/dates';
import { adherence, exerciseHistory, exerciseSeries, pullUpStatus, weeklyAverages, weeklyChange } from '../../engine/stats';
import type { Exercise } from '../../engine/model';
import { LineChart } from '../charts/LineChart';
import { NumberField } from '../logger/NumberField';
import { niceDate, today } from '../dates';
import { useBar, useProfile, useUnit } from '../profile';
import { hasGoal } from '../../data/profile';
import { formatLoad, fromDisplay, toDisplay } from '../../engine/units';
import { e1rmSeries } from '../../engine/records';
import { RecordsTab } from '../progress/RecordsTab';
import { formatMinutes, sessionMinutes } from '../../engine/duration';

type Tab = 'exercises' | 'records' | 'body' | 'pullup' | 'weeks';
const TABS: { id: Tab; label: string }[] = [
  { id: 'exercises', label: 'Exercises' },
  { id: 'records', label: 'Records' },
  { id: 'body', label: 'Body weight' },
  { id: 'pullup', label: 'Pull-ups' },
  { id: 'weeks', label: 'Weeks' },
];

function rememberedTab(): Tab {
  try {
    const t = localStorage.getItem('progress-tab');
    return TABS.some((x) => x.id === t) ? (t as Tab) : 'exercises';
  } catch {
    return 'exercises';
  }
}

export function ProgressScreen() {
  const db = getDb();
  const [data, setData] = useState<ProgressData | null>(null);
  const { profile } = useProfile();
  const tabs = TABS.filter((t) => t.id !== 'pullup' || hasGoal(profile, 'first-pull-up'));
  const [chosen, setTab] = useState<Tab>(rememberedTab);
  const tab = tabs.some((t) => t.id === chosen) ? chosen : 'exercises';
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadProgress(db).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [db, version]);

  function choose(t: Tab) {
    setTab(t);
    try {
      localStorage.setItem('progress-tab', t);
    } catch {
      // Remembering the tab is only a convenience.
    }
  }

  return (
    <section className="screen progress">
      <h1>Progress</h1>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? '' : 'secondary'} onClick={() => choose(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {!data ? (
        <p className="muted">Loading…</p>
      ) : tab === 'exercises' ? (
        <ExercisesTab data={data} />
      ) : tab === 'records' ? (
        <RecordsTab data={data} />
      ) : tab === 'body' ? (
        <BodyTab data={data} onChange={() => setVersion((v) => v + 1)} />
      ) : tab === 'pullup' ? (
        <PullUpTab data={data} />
      ) : (
        <WeeksTab data={data} />
      )}
    </section>
  );
}

function ExercisesTab({ data }: { data: ProgressData }) {
  const unit = useUnit();
  const bar = useBar();
  const done = new Set(data.sessions.filter((s) => s.status === 'completed').map((s) => s.id));
  const withHistory = [...data.exercises.values()]
    .filter((e) => data.sets.some((s) => s.exerciseId === e.id && s.completed && done.has(s.sessionId)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const [id, setId] = useState<string>(() => withHistory.find((e) => e.id === 'assisted-pull-up')?.id ?? withHistory[0]?.id ?? '');
  if (!withHistory.length) return <div className="card"><p className="muted">Finish a workout and your exercise history appears here.</p></div>;
  const exercise = data.exercises.get(id) ?? withHistory[0]!;
  const history = exerciseHistory(data.sessions, data.sets, exercise, unit, bar);
  const series = exerciseSeries(history, exercise, unit, bar);

  return (
    <>
      <div className="card">
        <label className="field">
          <span>Exercise</span>
          <select value={exercise.id} onChange={(e) => setId(e.target.value)}>
            {withHistory.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <ExerciseChart exercise={exercise} data={data} />
        {series.best && (
          <p className="muted small">
            Best: <strong>{series.best.label}</strong> ({niceDate(series.best.date)}) · {history.length} session{history.length === 1 ? '' : 's'}
          </p>
        )}
      </div>
      <div className="card">
        <h2>History</h2>
        <ul className="history">
          {[...history].reverse().map((h) => (
            <li key={h.sessionId}>
              {h.templateCode ? <Link to={`/session/${h.sessionId}`}>{niceDate(h.date)}</Link> : <strong>{niceDate(h.date)}</strong>}
              <span className="muted small"> {h.templateCode && h.templateCode.length <= 2 ? `· ${h.templateCode}` : ''}{data.sessions.find((s) => s.id === h.sessionId)?.flags.includes('legacyProgram') ? ' · old program, partial: not used for progression' : ''}{!h.templateCode && data.sessions.find((s) => s.id === h.sessionId)?.flags.includes('imported') ? ' · imported' : ''}</span>
              <div>{h.summary}</div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function ExerciseChart({ exercise, data }: { exercise: Exercise; data: ProgressData }) {
  const unit = useUnit();
  const bar = useBar();
  const [view, setView] = useState<'top' | 'e1rm'>('top');
  const history = exerciseHistory(data.sessions, data.sets, exercise, unit, bar);
  const top = exerciseSeries(history, exercise, unit, bar);
  const e1rm = e1rmSeries(history, exercise, unit, bar);
  const canEstimate = e1rm.points.length > 0;
  const s = view === 'e1rm' && canEstimate ? e1rm : top;
  return (
    <>
      {canEstimate && (
        <div className="segmented chart-switch">
          <button type="button" className={s === top ? '' : 'secondary'} aria-pressed={s === top} onClick={() => setView('top')}>Heaviest weight</button>
          <button type="button" className={s === e1rm ? '' : 'secondary'} aria-pressed={s === e1rm} onClick={() => setView('e1rm')}>Estimated 1RM</button>
        </div>
      )}
      <LineChart
        title={`${exercise.name}: ${s.title.toLowerCase()}`}
        unit={s.unit}
        note={s.lowerIsBetter ? 'lower is better' : s === e1rm ? 'estimated from your sets' : undefined}
        series={[{ name: s.title, color: 'var(--series-1)', points: s.points.map((p) => ({ x: p.date, y: p.value, label: p.label })) }]}
      />
    </>
  );
}

function BodyTab({ data, onChange }: { data: ProgressData; onChange: () => void }) {
  const db = getDb();
  const unit = useUnit();
  const w = (kg: number) => formatLoad(kg, unit);
  const [date, setDate] = useState(today());
  const [kg, setKg] = useState<number | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const weeks = weeklyAverages(data.bodyWeights);
  const change = weeklyChange(weeks);
  const latest = data.bodyWeights.at(-1);

  async function save() {
    const p = await saveBodyWeight(db, { date, kg: kg === null ? NaN : fromDisplay(kg, unit) }, today());
    setProblems(p);
    if (!p.length) {
      setKg(null);
      onChange();
    }
  }

  return (
    <>
      <div className="stats">
        <div className="stat"><span className="muted small">Latest</span><strong>{latest ? w(latest.kg) : '–'}</strong><span className="muted small">{latest ? niceDate(latest.date) : ''}</span></div>
        <div className="stat"><span className="muted small">This week's average</span><strong>{weeks.at(-1) ? w(weeks.at(-1)!.average) : '–'}</strong><span className="muted small">{weeks.at(-1) ? `${weeks.at(-1)!.count} weigh-in${weeks.at(-1)!.count === 1 ? '' : 's'}` : ''}</span></div>
        <div className="stat"><span className="muted small">vs last week</span><strong>{change === null ? '–' : `${change > 0 ? '+' : change < 0 ? '−' : '±'}${w(Math.abs(change))}`}</strong><span className="muted small">weekly average</span></div>
      </div>
      <div className="card">
        <LineChart
          title="Body weight"
          unit={unit}
          series={[
            { name: 'Weigh-ins', color: 'var(--series-1)', line: false, points: data.bodyWeights.map((b) => ({ x: b.date, y: toDisplay(b.kg, unit), label: w(b.kg) })) },
            { name: 'Weekly average', color: 'var(--series-2)', points: weeks.map((w) => ({ x: [addDays(w.weekStart, 3), today()].sort()[0]!, y: toDisplay(w.average, unit), label: `${formatLoad(w.average, unit)} avg (${w.count})` })) },
          ]}
        />
        <p className="muted small">Weigh in the morning, after the toilet, before food, 2–3× a week. Judge fat loss on the weekly average over 3–4 weeks.</p>
      </div>
      <div className="card form">
        <h2>Add a weigh-in</h2>
        <div className="set-row">
          <label className="field"><span>Date</span><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></label>
          <NumberField key={data.bodyWeights.length} label={unit} value={kg} onCommit={setKg} />
        </div>
        {problems.length > 0 && <p className="notice error">{problems.join('\n')}</p>}
        <button type="button" onClick={() => void save()}>Save weigh-in</button>
      </div>
      {data.bodyWeights.length > 0 && (
        <div className="card">
          <h2>All weigh-ins</h2>
          <ul className="history">
            {[...data.bodyWeights].reverse().map((b) => (
              <li key={b.date} className="row">
                <span>{niceDate(b.date)}</span>
                <strong>{w(b.kg)}</strong>
                <button type="button" className="link danger" onClick={() => { if (window.confirm(`Delete the weigh-in on ${niceDate(b.date)}?`)) void deleteBodyWeight(db, b.date).then(onChange); }}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function PullUpTab({ data }: { data: ProgressData }) {
  const unit = useUnit();
  const status = pullUpStatus(data.sessions, data.sets, unit);
  const ex = (id: string) => data.exercises.get(id);
  return (
    <>
      <div className={`card ${status.readyToTest ? 'highlight' : ''}`}>
        <h2>Path to the first strict pull-up</h2>
        {status.strictPullUps && <p className="notice ok">Strict pull-up logged: {status.strictPullUps.reps} rep{status.strictPullUps.reps === 1 ? '' : 's'} on {niceDate(status.strictPullUps.date)}.</p>}
        {status.readyToTest && !status.strictPullUps && <p className="notice ok">All milestones met: test a strict pull-up fresh at the start of your next C session.</p>}
        <ul className="milestones">
          {status.milestones.map((m) => (
            <li key={m.id} className={m.met ? 'met' : ''}>
              <span className="tick" aria-label={m.met ? 'reached' : 'not yet'}>{m.met ? '✓' : '○'}</span>
              <div>
                <strong>{m.name}</strong>
                <div className="small">Target: {m.target}</div>
                <div className="muted small">Now: {m.current}{m.date ? ` (${niceDate(m.date)})` : ''}</div>
              </div>
            </li>
          ))}
        </ul>
        <p className="muted small">A strict pull-up: from a still dead hang, chin clearly over the bar, controlled lowering, no kip or swing. Every bit of fat lost also makes it easier.</p>
      </div>
      {['assisted-pull-up', 'assisted-negative-pull-up', 'dead-hang', 'scapular-pull-up'].map((id) => {
        const e = ex(id);
        return e && data.sets.some((s) => s.exerciseId === id && s.completed) ? (
          <div className="card" key={id}>
            <ExerciseChart exercise={e} data={data} />
          </div>
        ) : null;
      })}
    </>
  );
}

function WeeksTab({ data }: { data: ProgressData }) {
  const rows = adherence(data.plans, data.sessions, today()).reverse();
  const weekTime = (start: string) => {
    const end = addDays(start, 7);
    const total = data.sessions.filter((s) => s.date >= start && s.date < end).reduce((sum, s) => sum + (sessionMinutes(s) ?? 0), 0);
    return total ? formatMinutes(total) : '–';
  };
  if (!rows.length) return <div className="card"><p className="muted">Save a week plan to track planned versus completed workouts.</p></div>;
  return (
    <div className="card">
      <h2>Planned vs completed</h2>
      <table className="data-table">
        <thead>
          <tr><th>Week of</th><th>Done</th><th>Missed</th><th>Skipped</th><th>Extra</th><th>Time</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.weekStart}>
              <td>{niceDate(r.weekStart)}</td>
              <td>
                <span className="meter" aria-hidden="true"><span style={{ width: `${r.planned ? Math.min(100, (r.done / r.planned) * 100) : 0}%` }} /></span>
                {r.done}/{r.planned}
              </td>
              <td>{r.missed || '–'}</td>
              <td>{r.skipped || '–'}</td>
              <td>{r.extra || '–'}</td>
              <td>{weekTime(r.weekStart)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Missed = planned on a past day but not done. Extra = completed but not on the plan.</p>
    </div>
  );
}
