import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDb } from '../../data/db';
import { loadProgress, type ProgressData } from '../../data/progress';
import { addDays, weekStart } from '../../engine/dates';
import type { WeekPlanEntry, WorkoutTemplate } from '../../engine/model';
import { coachingNotes, pullUpStatus, recentProgress, weeklyAverages, weeklyChange } from '../../engine/stats';
import { niceDate } from '../dates';
import { useProfile } from '../profile';
import { hasGoal } from '../../data/profile';
import { formatLoad } from '../../engine/units';
import { allRecords } from '../../engine/records';
import { RecordList } from '../progress/RecordsTab';
import { formatMeasure, measureChange } from '../../engine/measurements';

interface Props {
  date: string;
  templates: Map<string, WorkoutTemplate>;
  pending: number;
}

/** Below today's workout: notes, what's next, recent progress and headline numbers. */
export function Dashboard({ date, templates, pending }: Props) {
  const db = getDb();
  const { profile } = useProfile();
  const unit = profile.unit;
  const pullUpGoal = hasGoal(profile, 'first-pull-up');
  const [data, setData] = useState<ProgressData | null>(null);

  useEffect(() => {
    let alive = true;
    void loadProgress(db).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [db]);

  if (!data) return null;

  const completed = data.sessions.filter((s) => s.status === 'completed').sort((a, b) => (a.finishedAt ?? a.date).localeCompare(b.finishedAt ?? b.date));
  const last = completed.at(-1);
  const pullUp = pullUpStatus(data.sessions, data.sets, unit);
  const notes = coachingNotes({
    today: date,
    unit,
    lastSession: last ? { session: last, sets: data.sets.filter((s) => s.sessionId === last.id) } : null,
    pending,
    bodyWeights: data.bodyWeights,
    pullUp: pullUpGoal ? pullUp : null,
    trackBodyWeight: hasGoal(profile, 'lose-fat') || data.bodyWeights.length > 0,
  }).filter((n) => !n.includes('need your OK')); // the pending card above already says this

  const thisWeek = weekStart(date);
  const upcoming: WeekPlanEntry[] = data.plans
    .filter((p) => p.weekStart === thisWeek || p.weekStart === addDays(thisWeek, 7))
    .flatMap((p) => p.entries)
    .filter((e) => e.state === 'planned' && e.date > date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const progress = recentProgress(data.prescriptions, data.nameOf, 4);
  const weeks = weeklyAverages(data.bodyWeights);
  const change = weeklyChange(weeks);
  const latestWeek = weeks.at(-1);
  const met = pullUp.milestones.filter((m) => m.met).length;
  const recent = allRecords(data.exercises, data.sessions, data.sets, unit, profile.barKg).timeline.filter((r) => r.date >= addDays(date, -14));
  const waist = measureChange(data.measurements, 'waist');
  const records = recent.filter((r, i) => recent.findIndex((x) => x.exerciseId === r.exerciseId) === i).slice(0, 4); // newest per exercise
  const name = (code: string) => {
    const t = templates.get(code);
    return t ? (t.kind === 'program' ? `${t.code} · ${t.name}` : t.name) : code;
  };

  return (
    <>
      <div className="stats">
        {pullUpGoal && <Link to="/progress" className="stat">
          <span className="muted small">Pull-up path</span>
          <strong>{met}/4</strong>
          <span className="muted small">{pullUp.readyToTest ? 'ready to test' : 'milestones'}</span>
        </Link>}
        <Link to="/progress" className="stat">
          <span className="muted small">Avg body weight</span>
          <strong>{latestWeek ? formatLoad(latestWeek.average, unit) : '–'}</strong>
          <span className="muted small">
            {!latestWeek
              ? 'no weigh-ins yet'
              : latestWeek.weekStart === thisWeek
                ? change === null ? 'this week' : `this week, ${change > 0 ? '+' : change < 0 ? '−' : '±'}${formatLoad(Math.abs(change), unit)}`
                : `week of ${niceDate(latestWeek.weekStart)}`}
          </span>
        </Link>
        {waist && (
          <Link to="/progress" className="stat">
            <span className="muted small">Waist</span>
            <strong>{formatMeasure('waist', waist.latest.value, unit)}</strong>
            <span className="muted small">{waist.first.date === waist.latest.date ? niceDate(waist.latest.date) : `${waist.change > 0 ? '+' : waist.change < 0 ? '−' : '±'}${formatMeasure('waist', Math.abs(waist.change), unit)} since ${niceDate(waist.first.date)}`}</span>
          </Link>
        )}
      </div>

      {notes.length > 0 && (
        <div className="card">
          <h2>Coaching notes</h2>
          <ul className="reasons">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}

      {records.length > 0 && (
        <div className="card">
          <h2>New records</h2>
          <RecordList records={records} nameOf={(id) => data.exercises.get(id)?.name ?? id} />
          <Link to="/progress" className="link-button">All records</Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="card">
          <h2>Coming up</h2>
          <ul className="history">
            {upcoming.map((e) => (
              <li key={`${e.date}${e.templateCode}`} className="row">
                <span>{niceDate(e.date)}</span>
                <span>{name(e.templateCode)}</span>
              </li>
            ))}
          </ul>
          <Link to="/week" className="link-button">Open the week</Link>
        </div>
      )}

      {progress.length > 0 && (
        <div className="card">
          <h2>Recent progress</h2>
          <ul className="history">
            {progress.map((p) => (
              <li key={`${p.date}${p.name}`}>
                <strong>{p.name}</strong> <span className="muted small">· new target from {niceDate(p.date)}</span>
                <div className="small">{p.text}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
