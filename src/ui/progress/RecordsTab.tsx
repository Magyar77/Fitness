import { useMemo, useState } from 'react';
import type { ProgressData } from '../../data/progress';
import { allRecords, improvement, RECORD_LABEL, type PersonalRecord } from '../../engine/records';
import { niceDate } from '../dates';
import { useBar, useUnit } from '../profile';

/** One line per record: exercise, what, how much better. */
export function RecordList({ records, nameOf, showDate = true }: { records: PersonalRecord[]; nameOf: (id: string) => string; showDate?: boolean }) {
  const unit = useUnit();
  return (
    <ul className="records">
      {records.map((r) => (
        <li key={`${r.sessionId}-${r.exerciseId}-${r.kind}`}>
          <div className="record-head">
            <strong>{nameOf(r.exerciseId)}</strong>
            {r.previous !== null && <span className="gain">{improvement(r, unit)}</span>}
          </div>
          <span className="small">
            {RECORD_LABEL[r.kind]}: {r.label}
          </span>
          {showDate && <span className="muted small">{niceDate(r.date)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function RecordsTab({ data }: { data: ProgressData }) {
  const unit = useUnit();
  const bar = useBar();
  const [all, setAll] = useState(false);
  const { timeline, bests } = useMemo(() => allRecords(data.exercises, data.sessions, data.sets, unit, bar), [data, unit, bar]);
  const nameOf = (id: string) => data.exercises.get(id)?.name ?? id;
  const best = [...bests.entries()]
    .map(([id, list]) => ({ id, list, latest: list.reduce((d, r) => (r.date > d ? r.date : d), '') }))
    .sort((a, b) => b.latest.localeCompare(a.latest) || nameOf(a.id).localeCompare(nameOf(b.id)));

  if (!best.length) return <div className="card"><p className="muted">Records appear here once you have logged a few workouts.</p></div>;

  return (
    <>
      <div className="card">
        <h2>Recent records</h2>
        {timeline.length === 0 ? (
          <p className="muted small">No new records yet. They count from your second session of an exercise.</p>
        ) : (
          <>
            <RecordList records={all ? timeline : timeline.slice(0, 8)} nameOf={nameOf} />
            {timeline.length > 8 && (
              <button type="button" className="link" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${timeline.length}`}</button>
            )}
          </>
        )}
        <p className="muted small">Warm-ups and sets marked as bad form never count. The estimated 1-rep max uses the Epley formula from sets of 12 reps or fewer.</p>
      </div>
      <div className="card">
        <h2>Your bests</h2>
        <table className="data-table">
          <thead>
            <tr><th>Exercise</th><th>Best</th><th>When</th></tr>
          </thead>
          <tbody>
            {best.flatMap(({ id, list }) =>
              list.map((r, i) => (
                <tr key={`${id}-${r.kind}`}>
                  <td>{i === 0 ? nameOf(id) : ''}</td>
                  <td>
                    <span className="muted small">{RECORD_LABEL[r.kind]}</span>
                    <br />
                    {r.label}
                  </td>
                  <td className="small">{niceDate(r.date)}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
