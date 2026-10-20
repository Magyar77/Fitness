import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getDb } from '../../data/db';
import { addDiscomfort, addSet, discardSession, exerciseById, finishSession, findTemplate, lastForExercise, lastPerformance, removeSet, saveSet, swapExercise } from '../../data/workouts';
import { allExercises } from '../../data/custom';
import { similarExercises } from '../../engine/library/builder';
import { acceptDecision, evaluateSession, overrideDecision, rejectDecision, undoDecision } from '../../data/recommendations';
import { slotSummary, summarizeSets } from '../../engine/logging';
import type { DecisionRecord, TargetDraft } from '../../engine/progression';
import type { Discomfort, Exercise, SetLog, WorkoutSession, WorkoutTemplate } from '../../engine/model';
import { DecisionCard } from '../logger/DecisionCard';
import { RecordList } from '../progress/RecordsTab';
import { sessionRecords, type PersonalRecord } from '../../engine/records';
import { ExerciseCard } from '../logger/ExerciseCard';
import { RestTimer } from '../logger/RestTimer';
import { useBar, useUnit } from '../profile';
import { clock, niceDate } from '../dates';
import { formatMinutes, sessionMinutes } from '../../engine/duration';
import { NumberField } from '../logger/NumberField';

interface Loaded {
  session: WorkoutSession;
  template: WorkoutTemplate;
  exercises: Map<string, Exercise>;
  last: Map<string, { date: string; text: string } | null>;
  decisions: DecisionRecord[];
  library: Exercise[];
  records: PersonalRecord[];
}

const completedExerciseIds = (sets: SetLog[]) => sets.filter((s) => s.completed && !s.isWarmup).map((s) => s.exerciseId);

const FATIGUE = ['Very easy', 'Easy', 'Normal', 'Hard', 'Exhausted'];

function restKey(id: string) {
  return `rest:${id}`;
}

function readRest(id: string): number | null {
  try {
    const v = Number(localStorage.getItem(restKey(id)));
    return v > Date.now() - 60_000 ? v : null;
  } catch {
    return null;
  }
}

function writeRest(id: string, endsAt: number | null) {
  try {
    if (endsAt === null) localStorage.removeItem(restKey(id));
    else localStorage.setItem(restKey(id), String(endsAt));
  } catch {
    // Storage unavailable: the timer still works for this visit.
  }
}

export function SessionScreen() {
  const { id = '' } = useParams();
  const db = getDb();
  const unit = useUnit();
  const bar = useBar();
  const navigate = useNavigate();
  const [data, setData] = useState<Loaded | null>(null);
  const [sets, setSets] = useState<SetLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(() => readRest(id));
  const [finishing, setFinishing] = useState(false);
  const [fatigue, setFatigue] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [minutes, setMinutes] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const session = await db.sessions.get(id);
      if (!session) throw new Error('This workout was not found.');
      const template = await findTemplate(db, session);
      if (!template) throw new Error(`Workout ${session.templateCode} was not found.`);
      const exercises = new Map<string, Exercise>();
      const last = new Map<string, { date: string; text: string } | null>();
      for (const slot of template.slots) {
        const ex = await exerciseById(db, slot.exerciseId);
        if (!ex) continue;
        exercises.set(slot.exerciseId, ex);
        const swapped = session.swaps?.[slot.slotKey];
        const sub = swapped ? await exerciseById(db, swapped) : undefined;
        if (sub) exercises.set(sub.id, sub);
        const perf = sub ? await lastForExercise(db, sub.id, session.id) : await lastPerformance(db, template, slot, session.id);
        const before = perf && perf.session.date <= session.date && perf.session.id !== session.id ? perf : null;
        last.set(slot.slotKey, before ? { date: niceDate(before.session.date), text: summarizeSets(before.sets, sub ?? ex, unit, bar) } : null);
      }
      const library = session.status === 'in_progress' ? await allExercises(db) : [];
      let records: PersonalRecord[] = [];
      if (session.status === 'completed') {
        const mine = [...new Set(completedExerciseIds(await db.sets.where('sessionId').equals(id).toArray()))];
        const related = await db.sets.where('exerciseId').anyOf(mine).toArray();
        const relatedSessions = (await db.sessions.bulkGet([...new Set(related.map((s) => s.sessionId))])).filter((s): s is WorkoutSession => !!s);
        const byId = new Map((await allExercises(db)).filter((e) => mine.includes(e.id)).map((e) => [e.id, e]));
        records = sessionRecords(id, byId, relatedSessions, related, unit, bar);
      }
      const rows = (await db.sets.where('sessionId').equals(id).toArray()).sort((a, b) => a.setIndex - b.setIndex);
      const decisions = await db.decisions.where('basisSessionId').equals(id).toArray();
      return { session, template, exercises, last, rows, decisions, library, records };
    })()
      .then(({ rows, ...loaded }) => {
        if (!alive) return;
        setData(loaded);
        setSets(rows);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [db, id, version, unit, bar]);

  function persist(promise: Promise<unknown>) {
    promise.catch((e: Error) => setError(`Not saved: ${e.message}`));
  }

  function setRest(endsAt: number | null) {
    setRestEndsAt(endsAt);
    writeRest(id, endsAt);
  }

  function change(next: SetLog) {
    const prev = sets.find((s) => s.id === next.id);
    setSets((all) => all.map((s) => (s.id === next.id ? next : s)));
    persist(saveSet(db, next));
    if (prev && !prev.completed && next.completed) {
      const slot = data?.template.slots.find((s) => s.slotKey === next.slotKey);
      if (slot?.restSec) setRest(Date.now() + slot.restSec.min * 1000);
    }
  }

  function add(slotKey: string) {
    persist(addSet(db, id, slotKey).then((s) => setSets((all) => [...all, s])));
  }

  function remove(set: SetLog) {
    setSets((all) => all.filter((s) => s.id !== set.id));
    persist(removeSet(db, set.id));
  }

  function discomfort(d: Discomfort) {
    setData((cur) => (cur ? { ...cur, session: { ...cur.session, discomfort: [...cur.session.discomfort, d] } } : cur));
    persist(addDiscomfort(db, id, d));
  }

  async function finish() {
    try {
      await finishSession(db, id, { fatigue, notes: notes.trim() ? [notes.trim()] : [], durationMin: minutes });
      await evaluateSession(db, id);
      setRest(null);
      setFinishing(false);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function act(task: Promise<void>) {
    try {
      await task;
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function swap(slotKey: string, exerciseId: string | null) {
    await act(swapExercise(db, id, slotKey, exerciseId));
  }

  async function discard() {
    if (!window.confirm('Discard this workout and everything logged in it?')) return;
    await discardSession(db, id);
    setRest(null);
    navigate('/today');
  }

  if (error && !data) return <section className="screen"><p className="notice error">{error}</p><Link to="/today">← Today</Link></section>;
  if (!data) return <section className="screen"><p className="muted">Loading…</p></section>;

  const { session, template, exercises, last, decisions, library, records } = data;
  const swappedTo = (slotKey: string) => {
    const sub = session.swaps?.[slotKey];
    return sub ? exercises.get(sub) : undefined;
  };
  const completed = session.status === 'completed';
  const snapshot = new Map((session.prescriptionSnapshot ?? []).map((e) => [e.slotKey, e.text]));
  const doneCount = sets.filter((s) => s.completed).length;
  const elapsed = session.startedAt ? Math.max(0, Math.round((now - Date.parse(session.startedAt)) / 60000)) : null;

  return (
    <section className={`screen session ${restEndsAt ? 'with-rest' : ''}`}>
      <Link to="/today" className="back">← Today</Link>
      <h1>{template.kind === 'program' ? `${template.code} · ` : ''}{template.name}</h1>
      <p className="muted">
        {niceDate(session.date)} · started {clock(session.startedAt)}
        {completed && ` · finished ${clock(session.finishedAt)}`}
        {completed && sessionMinutes(session) !== null && ` · took ${formatMinutes(sessionMinutes(session)!)}`}
        {!completed && elapsed !== null && ` · ${formatMinutes(elapsed)} so far`}
      </p>
      {error && <p className="notice error">{error}</p>}


      {completed && records.length > 0 && (
        <div className="card highlight">
          <h2>New record{records.length === 1 ? '' : 's'}</h2>
          <RecordList records={records} nameOf={(eid) => exercises.get(eid)?.name ?? library.find((e) => e.id === eid)?.name ?? eid} showDate={false} />
        </div>
      )}

      {completed && (
        <div className="card">
          <h2>Workout saved · next time</h2>
          {decisions.length === 0 && <p className="muted">No recommendations for this workout.</p>}
          {decisions.some((d) => d.status === 'pending') && (
            <p className="notice warn small">Some changes need your OK. Until then, the current targets stay.</p>
          )}
          {template.slots
            .map((slot) => decisions.find((d) => d.slotKey === slot.slotKey))
            .filter((d): d is DecisionRecord => !!d)
            .map((d) => {
              const slot = template.slots.find((s) => s.slotKey === d.slotKey);
              return (
                <DecisionCard
                  key={d.id}
                  decision={d}
                  slot={slot}
                  exercise={slot ? exercises.get(slot.exerciseId) : undefined}
                  onAccept={() => void act(acceptDecision(db, d.id))}
                  onReject={() => void act(rejectDecision(db, d.id))}
                  onOverride={(draft: TargetDraft) => void act(overrideDecision(db, d.id, draft))}
                  onUndo={() => void act(undoDecision(db, d.id))}
                />
              );
            })}
        </div>
      )}

      {completed && (
        <div className="card">
          <h2>What you did</h2>
          {session.fatigue !== null && <p className="muted">Fatigue: {session.fatigue}/5 ({FATIGUE[session.fatigue - 1]})</p>}
          {session.notes.map((n) => <p key={n} className="muted">"{n}"</p>)}
          <ul className="summary">
            {template.slots.map((slot) => {
              const sub = swappedTo(slot.slotKey);
              const ex = sub ?? exercises.get(slot.exerciseId);
              if (!ex) return null;
              return (
                <li key={slot.slotKey}>
                  <strong>{sub ? `${sub.name} (instead of ${slot.name})` : slot.name}</strong>
                  <span className={sets.some((s) => s.slotKey === slot.slotKey && s.completed) ? '' : 'muted'}>{sets.some((s) => s.slotKey === slot.slotKey && s.completed) ? summarizeSets(sets.filter((s) => s.slotKey === slot.slotKey), ex, unit, bar) : 'skipped'}</span>
                  <span className="muted small">Target: {snapshot.get(slot.slotKey) ?? '–'}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!completed && (
        <>
          {template.slots.map((slot) => {
            const original = exercises.get(slot.exerciseId);
            if (!original) return null;
            const sub = swappedTo(slot.slotKey);
            const ex = sub ?? original;
            return (
              <ExerciseCard
                key={slot.slotKey}
                slot={slot}
                exercise={ex}
                original={sub ? original : undefined}
                library={library}
                swapOptions={similarExercises(original, library, 6)}
                onSwap={(exerciseId) => void swap(slot.slotKey, exerciseId)}
                target={sub ? `${slotSummary(slot)}: pick a weight that fits` : snapshot.get(slot.slotKey) ?? ''}
                last={last.get(slot.slotKey) ?? null}
                sets={sets.filter((s) => s.slotKey === slot.slotKey)}
                discomfort={session.discomfort.filter((d) => d.slotKey === slot.slotKey)}
                onChange={change}
                onAdd={() => add(slot.slotKey)}
                onRemove={remove}
                onDiscomfort={discomfort}
              />
            );
          })}

          {!finishing ? (
            <div className="card">
              <p className="muted">{doneCount} of {sets.length} sets done. Everything is saved as you go.</p>
              <div className="buttons">
                <button type="button" onClick={() => { setMinutes(elapsed !== null && elapsed <= 240 ? elapsed : null); setFinishing(true); }}>Finish workout</button>
                <button type="button" className="link danger" onClick={() => void discard()}>Discard</button>
              </div>
            </div>
          ) : (
            <div className="card">
              <h2>How hard was the session overall?</h2>
              <div className="fatigue">
                {FATIGUE.map((label, i) => (
                  <button key={label} type="button" className={fatigue === i + 1 ? '' : 'secondary'} onClick={() => setFatigue(i + 1)} aria-pressed={fatigue === i + 1} aria-label={`Fatigue ${i + 1}: ${label}`}>
                    {i + 1}
                    <small>{label}</small>
                  </button>
                ))}
              </div>
              <div className="duration-field">
                <NumberField label="How long it took (min)" integer value={minutes} onCommit={setMinutes} />
                {elapsed !== null && elapsed > 240 && <span className="muted small">Started more than 4 hours ago, so enter the real time.</span>}
              </div>
              <textarea placeholder="Notes: sleep, energy, anything unusual (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              {doneCount < sets.length && <p className="muted small">{sets.length - doneCount} set(s) not marked done will be saved as not completed.</p>}
              <div className="buttons">
                <button type="button" onClick={() => void finish()}>Save workout</button>
                <button type="button" className="secondary" onClick={() => setFinishing(false)}>Back</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Keyed so each new rest starts with a fresh clock (no stale first frame). */}
      {!completed && <RestTimer key={restEndsAt ?? 'none'} endsAt={restEndsAt} onChange={setRest} />}
    </section>
  );
}
