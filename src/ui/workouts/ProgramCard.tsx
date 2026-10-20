import { useEffect, useState } from 'react';
import { formatMinutes, plannedMinutes } from '../../engine/duration';
import { Link } from 'react-router-dom';
import { getDb } from '../../data/db';
import { chooseProgram, createOwnProgram, moveProgramWorkout, programChoices, programHistory, removeProgramWorkout } from '../../data/programs';
import { currentProgram } from '../../data/workouts';
import { slotSummary } from '../../engine/logging';
import type { ProgramVersion } from '../../engine/model';
import { niceDate, today } from '../dates';

interface Loaded {
  program: ProgramVersion;
  choices: ProgramVersion[];
  versions: number;
}

/** The active program: its workouts (edit, reorder, remove, add) and switching programs. */
export function ProgramCard({ onChanged }: { onChanged?: () => void }) {
  const db = getDb();
  const [data, setData] = useState<Loaded | null>(null);
  const [version, setVersion] = useState(0);
  const [changing, setChanging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([currentProgram(db), programChoices(db), programHistory(db)]).then(([program, choices, history]) => {
      if (alive) setData({ program, choices, versions: history.length });
    });
    return () => {
      alive = false;
    };
  }, [db, version]);

  if (!data) return null;
  const { program, choices } = data;
  const none = program.id === 'none';
  const ordered = program.canonicalOrder.map((c) => program.templates.find((t) => t.code === c)).filter((t): t is NonNullable<typeof t> => !!t);

  async function act(task: () => Promise<unknown>, done?: string) {
    try {
      await task();
      setMessage(done ?? null);
      setVersion((v) => v + 1);
      onChanged?.();
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  function switchTo(p: ProgramVersion | 'own' | 'none') {
    const name = p === 'own' ? 'a new program of your own' : p === 'none' ? 'no program' : p.label;
    if (!window.confirm(`Switch to ${name}? Your history stays; planned days from today on are cleared so the week can be re-planned.`)) return;
    setChanging(false);
    void act(
      () => (p === 'own' ? createOwnProgram(db, today()) : chooseProgram(db, p === 'none' ? 'none' : p.id, today())),
      `Switched to ${name}. Open the Week tab to plan the rest of the week.`,
    );
  }

  return (
    <div className="card">
      <h2>{none ? 'No program' : program.label}{program.isOriginal && !none && <span className="badge">original</span>}</h2>
      {message && <p className="notice ok small">{message}</p>}
      {none ? (
        <p className="muted small">You're logging your own workouts without a weekly program.</p>
      ) : (
        <p className="muted small">
          {program.isOriginal
            ? 'Weekly targets adapt to your results; the program itself stays as written until you change it.'
            : `Your version (${data.versions} saved version${data.versions === 1 ? '' : 's'}, latest ${niceDate(program.createdAt)}). Past workouts keep the version they used.`}
        </p>
      )}

      {ordered.map((t, i) => (
        <details key={t.code} className="program-workout">
          <summary>
            {t.code} · {t.name}
            <span className="muted small"> · {t.slots.length} exercises · ~{formatMinutes(plannedMinutes(t))}</span>
          </summary>
          <ol className="program-list">
            {t.slots.map((s) => (
              <li key={s.slotKey}>
                {s.name}
                <span className="muted small"> · {slotSummary(s)}</span>
                {s.notes.length > 0 && <span className="muted small"> · {s.notes.join('; ')}</span>}
              </li>
            ))}
          </ol>
          <div className="buttons">
            <Link to={`/program/${t.code}`} className="link-button">Edit</Link>
            <button type="button" className="link" disabled={i === 0} onClick={() => void act(() => moveProgramWorkout(db, t.code, -1, today()))} aria-label={`Move ${t.name} earlier in the week`}>↑ earlier</button>
            <button type="button" className="link" disabled={i === ordered.length - 1} onClick={() => void act(() => moveProgramWorkout(db, t.code, 1, today()))} aria-label={`Move ${t.name} later in the week`}>↓ later</button>
            <button
              type="button"
              className="link danger"
              onClick={() => {
                if (window.confirm(`Remove ${t.name} from the program? Past sessions of it are kept.`)) void act(() => removeProgramWorkout(db, t.code, today()), `Removed ${t.name}.`);
              }}
            >
              Remove
            </button>
          </div>
        </details>
      ))}

      <div className="buttons">
        {!none && <Link to="/program/new" className="button-link">+ Add workout to program</Link>}
        <button type="button" className="secondary" onClick={() => setChanging(!changing)} aria-expanded={changing}>Change program</button>
      </div>

      {changing && (
        <div className="choices">
          {choices.filter((p) => p.id !== program.id).map((p) => (
            <div key={p.id} className="choice">
              <strong>{p.label}</strong>
              {p.about?.description && <span className="muted small">{p.about.description}</span>}
              <button type="button" className="secondary" onClick={() => switchTo(p)}>Use this</button>
            </div>
          ))}
          <div className="choice">
            <strong>Build my own</strong>
            <span className="muted small">Start an empty program and add your own workouts.</span>
            <button type="button" className="secondary" onClick={() => switchTo('own')}>Start</button>
          </div>
          {!none && (
            <div className="choice">
              <strong>No program</strong>
              <span className="muted small">Just log your own workouts.</span>
              <button type="button" className="secondary" onClick={() => switchTo('none')}>Use no program</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
