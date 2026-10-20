import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDb } from '../../data/db';
import { allExercises } from '../../data/custom';
import { importLog, previewLog, type ImportResult, type NameChoice } from '../../data/importLog';
import { EXERCISE_KINDS, type ExerciseKind } from '../../engine/custom';
import { parseLog, type ParsedLog } from '../../engine/import/csvLog';
import type { Exercise } from '../../engine/model';
import { formatLoad } from '../../engine/units';
import { niceDate, today } from '../dates';
import { downloadText } from '../download';
import { useBar, useUnit } from '../profile';
import { aiPrompt, templateCsv } from '../import/prompt';

const encodeChoice = (c: NameChoice) => (c.kind === 'existing' ? `e:${c.exerciseId}` : c.kind === 'new' ? `n:${c.as}` : 'skip');
const decodeChoice = (v: string): NameChoice =>
  v.startsWith('e:') ? { kind: 'existing', exerciseId: v.slice(2) } : v.startsWith('n:') ? { kind: 'new', as: v.slice(2) as ExerciseKind } : { kind: 'skip' };

/** Bring in history from another app, a spreadsheet or notes (via any AI chat). */
export function ImportScreen() {
  const db = getDb();
  const unit = useUnit();
  const bar = useBar();
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [text, setText] = useState('');
  const [log, setLog] = useState<ParsedLog | null>(null);
  const [choices, setChoices] = useState<Map<string, NameChoice>>(new Map());
  const [barIncluded, setBarIncluded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    allExercises(db).then((list) => {
      if (alive) setExercises(list);
    });
    return () => {
      alive = false;
    };
  }, [db, result]);

  const preview = useMemo(() => (log && exercises ? previewLog(log, exercises) : null), [log, exercises]);
  const byId = useMemo(() => new Map((exercises ?? []).map((e) => [e.id, e])), [exercises]);

  function read(content: string) {
    // AI chats wrap the CSV in a code block; take what is inside.
    const fenced = /```[a-z]*\s*\n([\s\S]*?)```/i.exec(content);
    const csv = (fenced ? fenced[1]! : content).trim();
    const parsed = parseLog(csv, unit, today());
    setLog(parsed);
    setResult(null);
    setError(null);
    if (exercises) setChoices(new Map(previewLog(parsed, exercises).names.map((r) => [r.name, r.choice])));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const content = await file.text();
    setText(content.length > 20000 ? '' : content);
    read(content);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiPrompt(unit));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Copying is blocked here; open "Show the prompt" and copy it by hand.');
    }
  }

  async function run() {
    if (!log) return;
    setBusy(true);
    try {
      setResult(await importLog(db, log, { choices, barIncluded, barKg: bar ?? 20 }));
      setLog(null);
      setText('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const needsBar = preview?.names.some((r) => {
    const c = choices.get(r.name);
    return c?.kind === 'existing' && byId.get(c.exerciseId)?.loadType === 'plates';
  });
  const importing = preview ? preview.names.filter((r) => choices.get(r.name)?.kind !== 'skip').reduce((n, r) => n + r.sets, 0) : 0;

  return (
    <section className="screen import">
      <Link to="/more" className="back">← More</Link>
      <h1>Bring in your history</h1>
      <p className="muted small">Old workouts show up in Progress and as "last time" in the logger. They never change your current targets, and nothing already in the app is overwritten.</p>

      {result && (
        <div className="notice ok">
          Imported {result.sessions} workout{result.sessions === 1 ? '' : 's'} ({result.sets} sets){result.bodyWeights ? ` and ${result.bodyWeights} body weight${result.bodyWeights === 1 ? '' : 's'}` : ''}.
          {result.newExercises.length > 0 && `\nNew exercises: ${result.newExercises.join(', ')}.`}
          {result.alreadyThere > 0 && `\n${result.alreadyThere} workout${result.alreadyThere === 1 ? ' was' : 's were'} already imported, so skipped.`}
          {'\n'}<Link to="/progress">See it in Progress →</Link>
        </div>
      )}
      {error && <p className="notice error">{error}</p>}

      <div className="card">
        <h2>From Strong, Hevy or a spreadsheet</h2>
        <p className="muted small">Export your workouts as CSV in the other app, then choose the file here. Most exports work as they are: the app finds the date, exercise, weight and reps columns by name.</p>
        <button type="button" className="secondary" onClick={() => fileInput.current?.click()}>Choose a CSV file</button>
        <input ref={fileInput} type="file" accept=".csv,text/csv,text/plain" hidden onChange={(e) => void onFile(e)} />
      </div>

      <div className="card">
        <h2>From anything else, with an AI chat</h2>
        <p className="muted small">Screenshots, notes, a PDF from a coach, an odd spreadsheet: let any AI chat (ChatGPT, Claude, Gemini, Copilot…) turn it into the right format.</p>
        <ol className="steps">
          <li>Copy the prompt below.</li>
          <li>Open an AI chat, paste the prompt, then attach or paste your data.</li>
          <li>Copy the CSV it replies with.</li>
          <li>Paste it in the box below (or save it as a .csv file and choose it above).</li>
          <li>Check the preview, then import.</li>
        </ol>
        <div className="buttons">
          <button type="button" onClick={() => void copyPrompt()}>{copied ? 'Copied ✓' : 'Copy the prompt'}</button>
          <button type="button" className="secondary" onClick={() => downloadText('workout-log-template.csv', templateCsv(unit), 'text/csv')}>Download template</button>
        </div>
        <details>
          <summary>Show the prompt</summary>
          <pre className="prompt">{aiPrompt(unit)}</pre>
        </details>
        <p className="muted small">Your data goes to the AI service you choose. This app itself never uploads anything. AI can misread things, so check the preview.</p>
        <label className="field">
          <span>Paste the CSV here</span>
          <textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="date,workout,exercise,set,weight,…" spellCheck={false} />
        </label>
        <button type="button" className="secondary" onClick={() => read(text)} disabled={!text.trim()}>Check it</button>
      </div>

      {log && preview && (
        <div className="card">
          <h2>Preview</h2>
          {preview.sets === 0 && log.bodyWeights.length === 0 ? (
            <p className="notice warn">Nothing to import.</p>
          ) : (
            <p>
              {preview.sessions} workout{preview.sessions === 1 ? '' : 's'}, {preview.sets} sets
              {log.bodyWeights.length > 0 && `, ${log.bodyWeights.length} body weight${log.bodyWeights.length === 1 ? '' : 's'}`}
              {preview.from && ` · ${niceDate(preview.from)} to ${niceDate(preview.to!)}`}
            </p>
          )}
          {log.dateOrder && <p className="muted small">Dates like 03/04 were read as {log.dateOrder === 'day-first' ? 'day/month' : 'month/day'}.</p>}
          {log.problems.length > 0 && (
            <details className="problems" open={preview.sets === 0}>
              <summary>{log.problems.length} row{log.problems.length === 1 ? '' : 's'} left out</summary>
              <ul>
                {log.problems.slice(0, 30).map((p, i) => <li key={i}>Line {p.line}: {p.message}</li>)}
                {log.problems.length > 30 && <li>…and {log.problems.length - 30} more.</li>}
              </ul>
            </details>
          )}

          {preview.names.length > 0 && (
            <>
              <h2 className="sub">Exercises</h2>
              <p className="muted small">Check each one. Matching an exercise you already log keeps its history in one chart.</p>
              <ul className="name-map">
                {preview.names.map((r) => {
                  const choice = choices.get(r.name) ?? r.choice;
                  return (
                    <li key={r.name} className={r.match ? '' : 'unmatched'}>
                      <div>
                        <strong>{r.name}</strong>
                        <span className="muted small"> · {r.sets} set{r.sets === 1 ? '' : 's'}{!r.match && ' · no match found'}</span>
                      </div>
                      <select aria-label={`What is ${r.name}?`} value={encodeChoice(choice)} onChange={(e) => setChoices(new Map(choices).set(r.name, decodeChoice(e.target.value)))}>
                        {r.candidates.length > 0 && (
                          <optgroup label="Same as">
                            {r.candidates.map((c) => <option key={c.exercise.id} value={`e:${c.exercise.id}`}>{c.exercise.name}</option>)}
                          </optgroup>
                        )}
                        <optgroup label="Add as a new exercise">
                          {EXERCISE_KINDS.map((k) => <option key={k.kind} value={`n:${k.kind}`}>New: {k.label}</option>)}
                        </optgroup>
                        <option value="skip">Leave out</option>
                      </select>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {needsBar && (
            <label className="flag goal">
              <input type="checkbox" checked={barIncluded} onChange={(e) => setBarIncluded(e.target.checked)} />
              <span>
                Barbell weights in the file include the bar (most apps do). The app takes off {formatLoad(bar ?? 20, unit)} for lifts it records as plates only.
              </span>
            </label>
          )}
          <div className="buttons">
            <button type="button" onClick={() => void run()} disabled={busy || (importing === 0 && log.bodyWeights.length === 0)}>
              Import {importing} set{importing === 1 ? '' : 's'}{log.bodyWeights.length ? ` + ${log.bodyWeights.length} body weight${log.bodyWeights.length === 1 ? '' : 's'}` : ''}
            </button>
            <button type="button" className="link" onClick={() => setLog(null)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
