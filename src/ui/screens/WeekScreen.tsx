import { useEffect, useState } from 'react';
import { formatMinutes, plannedMinutes } from '../../engine/duration';
import { useNavigate } from 'react-router-dom';
import { getDb } from '../../data/db';
import { checkWeek, loadWeekContext, proposeWeek, saveWeek, unplaced, type WeekContext } from '../../data/weeks';
import { customWorkouts } from '../../data/custom';
import { exerciseMap } from '../../data/custom';
import { currentProgram, findTemplate, startSession } from '../../data/workouts';
import { WorkoutPreview } from '../week/WorkoutPreview';
import { addDays, weekDates, weekStart as mondayOf, type IsoDate } from '../../engine/dates';
import type { Exercise, Prescription, ProgramVersion, SetLog, WeekPlanEntry, WorkoutTemplate } from '../../engine/model';
import type { ScheduleWarning } from '../../engine/scheduling';
import { niceDate, today } from '../dates';

type Availability = 'train' | 'rest' | 'unavailable';

interface Draft {
  restDays: IsoDate[];
  unavailableDays: IsoDate[];
  entries: WeekPlanEntry[];
  notes: string[];
  /** Unsaved changes. */
  dirty: boolean;
  /** Entries were moved/skipped/added by hand since the last proposal. */
  manual: boolean;
}

type Selection = { kind: 'entry'; index: number } | { kind: 'template'; code: string } | null;

const NEXT: Record<Availability, Availability> = { train: 'rest', rest: 'unavailable', unavailable: 'train' };
const LABEL: Record<Availability, string> = { train: 'Train', rest: 'Rest', unavailable: "Can't train" };

function fromPlan(ctx: WeekContext): WeekPlanEntry[] {
  const plan = ctx.plan!;
  const entries = plan.entries.map((e) => {
    const done = ctx.completed.find((c) => c.sessionId && c.sessionId === e.sessionId);
    return done ? { ...e, state: 'done' as const } : e;
  });
  for (const c of ctx.completed) if (!entries.some((e) => e.sessionId === c.sessionId)) entries.push(c);
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export function WeekScreen() {
  const db = getDb();
  const now = today();
  const [weekStart, setWeekStart] = useState(() => mondayOf(now));
  const [ctx, setCtx] = useState<WeekContext | null>(null);
  const [program, setProgram] = useState<ProgramVersion | null>(null);
  const [mine, setMine] = useState<WorkoutTemplate[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const navigate = useNavigate();
  const [details, setDetails] = useState<{ prescriptions: Prescription[]; exercises: Map<string, Exercise>; sets: SetLog[]; sessionTemplates: Map<string, WorkoutTemplate> } | null>(null);
  /** Expanded workouts, keyed "date:code". */
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    Promise.all([loadWeekContext(db, weekStart), currentProgram(db), customWorkouts(db, true), db.prescriptions.toArray(), exerciseMap(db)])
      .then(async ([c, p, m, prescriptions, exercises]) => {
        const doneIds = c.completed.map((e) => e.sessionId).filter((id): id is string => !!id);
        const sets = doneIds.length ? await db.sets.where('sessionId').anyOf(doneIds).toArray() : [];
        // Completed days show the workout as it was, even after a program change.
        const sessionTemplates = new Map<string, WorkoutTemplate>();
        for (const session of await db.sessions.bulkGet(doneIds)) {
          const t = session ? await findTemplate(db, session) : undefined;
          if (session && t) sessionTemplates.set(session.id, t);
        }
        if (!alive) return;
        setDetails({ prescriptions, exercises, sets, sessionTemplates });
        setCtx(c);
        setProgram(p);
        setMine(m);
        setSelected(null);
        setMessage(null);
        if (c.plan) {
          setDraft({ restDays: c.plan.restDays, unavailableDays: c.plan.unavailableDays, entries: fromPlan(c), notes: c.plan.notes, dirty: false, manual: false });
        } else {
          const proposal = proposeWeek(c, p, c.suggestedRest, [], now);
          setDraft({ restDays: c.suggestedRest, unavailableDays: [], entries: proposal.entries, notes: proposal.notes, dirty: true, manual: false });
        }
      })
      .catch((e: Error) => alive && setMessage({ kind: 'error', text: e.message }));
    return () => {
      alive = false;
    };
  }, [db, weekStart, now]);

  if (!ctx || !program || !draft) {
    return <section className="screen"><h1>Week</h1>{message ? <p className="notice error">{message.text}</p> : <p className="muted">Loading…</p>}</section>;
  }

  const templates = program.templates;
  const everything = [...templates, ...mine];
  const byCode = new Map(everything.map((t) => [t.code, t]));
  const dates = weekDates(weekStart);
  const isPast = (d: IsoDate) => d < now;
  const weekOver = dates.every(isPast);
  const availability = (d: IsoDate): Availability => (draft.restDays.includes(d) ? 'rest' : draft.unavailableDays.includes(d) ? 'unavailable' : 'train');
  const warnings: ScheduleWarning[] = checkWeek(ctx, everything, draft.entries, draft.restDays, draft.unavailableDays);
  const missing = unplaced(templates, draft.entries);
  const conflicts = warnings.filter((w) => w.severity === 'conflict');

  function replan(restDays: IsoDate[], unavailableDays: IsoDate[]) {
    const p = proposeWeek(ctx!, program!, restDays, unavailableDays, now);
    setDraft({ restDays, unavailableDays, entries: p.entries, notes: p.notes, dirty: true, manual: false });
    setSelected(null);
  }

  function setAvailability(d: IsoDate) {
    const next = NEXT[availability(d)];
    const restDays = draft!.restDays.filter((x) => x !== d).concat(next === 'rest' ? [d] : []).sort();
    const unavailableDays = draft!.unavailableDays.filter((x) => x !== d).concat(next === 'unavailable' ? [d] : []).sort();
    if (draft!.manual) setDraft({ ...draft!, restDays, unavailableDays, dirty: true });
    else replan(restDays, unavailableDays);
  }

  function edit(entries: WeekPlanEntry[]) {
    setDraft({ ...draft!, entries: entries.sort((a, b) => a.date.localeCompare(b.date)), dirty: true, manual: true });
    setSelected(null);
  }

  function placeOn(d: IsoDate) {
    if (!selected) return;
    if (selected.kind === 'entry') {
      edit(draft!.entries.map((e, i) => (i === selected.index ? { ...e, date: d, origin: 'manual', state: 'planned' } : e)));
    } else {
      const rest = draft!.entries.filter((e) => !(e.templateCode === selected.code && e.state === 'skipped'));
      edit([...rest, { date: d, templateCode: selected.code, origin: 'manual', state: 'planned' }]);
    }
  }

  function skipSelected() {
    if (selected?.kind !== 'entry') return;
    edit(draft!.entries.map((e, i) => (i === selected.index ? { ...e, state: 'skipped' } : e)));
  }

  function toggle(key: string) {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpen(next);
  }

  async function start(t: WorkoutTemplate, date: IsoDate) {
    // Only today's workout is started from here; future ones are moved to today first.
    try {
      const id = await startSession(db, t, t.kind === 'program' ? program!.id : null, date);
      navigate(`/session/${id}`);
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    }
  }

  async function save() {
    if (conflicts.length && !window.confirm(`Save anyway?\n\n${conflicts.map((c) => c.message).join('\n')}`)) return;
    try {
      await saveWeek(db, { weekStart, restDays: draft!.restDays, unavailableDays: draft!.unavailableDays, status: 'saved', entries: draft!.entries, notes: draft!.notes });
      setDraft({ ...draft!, dirty: false });
      setMessage({ kind: 'ok', text: 'Week saved.' });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  }

  const templateOf = (e: WeekPlanEntry) => (e.sessionId ? details?.sessionTemplates.get(e.sessionId) : undefined) ?? byCode.get(e.templateCode);
  const entryName = (e: WeekPlanEntry) => {
    const t = templateOf(e);
    return t ? (t.kind === 'program' ? `${t.code} · ${t.name}` : t.name) : e.templateCode;
  };
  const name = (code: string) => {
    const t = byCode.get(code);
    return t ? (t.kind === 'program' ? `${t.code} · ${t.name}` : t.name) : code;
  };
  const selectedName = selected?.kind === 'entry' ? name(draft.entries[selected.index]!.templateCode) : selected ? name(selected.code) : '';
  const doneCount = draft.entries.filter((e) => e.state === 'done').length;
  const plannedCount = draft.entries.filter((e) => e.state !== 'skipped').length;

  return (
    <section className="screen week">
      <div className="week-nav">
        <button type="button" className="secondary" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹</button>
        <h1>Week of {niceDate(weekStart)}</h1>
        <button type="button" className="secondary" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">›</button>
      </div>
      <p className="muted">
        {doneCount} of {plannedCount} done · {draft.dirty ? (ctx.plan ? 'unsaved changes' : 'proposal, not saved yet') : 'saved'}
      </p>
      {message && <p className={`notice ${message.kind}`}>{message.text}</p>}
      {!weekOver && !draft.manual && <p className="muted small">Tap a day to switch Train → Rest → Can't train. The week re-plans automatically.</p>}
      {draft.manual && <p className="muted small">You've arranged workouts by hand, so changing days won't re-plan. Use "Re-plan week" to start over.</p>}

      {selected && (
        <div className="card highlight select-bar">
          <p><strong>{selectedName}</strong>: tap "Put here" on a day.</p>
          <div className="buttons">
            {selected.kind === 'entry' && <button type="button" className="secondary" onClick={skipSelected}>Skip this week</button>}
            <button type="button" className="link" onClick={() => setSelected(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="expand-all">
        <span className="muted small">Exercises:</span>
        <button type="button" className="link" onClick={() => setOpen(new Set(draft.entries.filter((e) => e.state !== 'skipped').map((e) => `${e.date}:${e.templateCode}`)))}>show all</button>
        <button type="button" className="link" onClick={() => setOpen(new Set())}>hide all</button>
      </div>

      <div className="days">
        {dates.map((d) => {
          const a = availability(d);
          const items = draft.entries.map((e, i) => ({ e, i })).filter(({ e }) => e.date === d && e.state !== 'skipped');
          const locked = isPast(d) || items.some(({ e }) => e.state === 'done');
          return (
            <div key={d} className={`day ${a} ${isPast(d) ? 'past' : ''} ${d === now ? 'today' : ''}`}>
              <div className="day-head">
                <span className="day-name">{niceDate(d)}{d === now && ' · today'}</span>
                <button type="button" className={`avail ${a}`} disabled={locked} onClick={() => setAvailability(d)} aria-label={`${niceDate(d)}: ${LABEL[a]}. Tap to change.`}>
                  {LABEL[a]}
                </button>
              </div>
              {items.map(({ e, i }) => {
                const key = `${e.date}:${e.templateCode}`;
                const expanded = open.has(key);
                const t = templateOf(e);
                return (
                  <div key={`${e.templateCode}${i}`} className="entry-block">
                    <div className="entry-wrap">
                      <button
                        type="button"
                        className={`entry ${e.state} ${selected?.kind === 'entry' && selected.index === i ? 'selected' : ''}`}
                        disabled={e.state === 'done'}
                        onClick={() => setSelected({ kind: 'entry', index: i })}
                        aria-label={`${entryName(e)}, ${e.state === 'done' ? 'done' : 'planned'}. Tap to move or skip.`}
                      >
                        <span>{entryName(e)}</span>
                        <span className="entry-state">{e.state === 'done' ? '✓ done' : isPast(d) ? 'missed' : `planned${t ? ` · ~${formatMinutes(plannedMinutes(t))}` : ''}`}</span>
                      </button>
                      <button type="button" className="icon expand" onClick={() => toggle(key)} aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} exercises for ${entryName(e)}`}>
                        {expanded ? '⌃' : '⌄'}
                      </button>
                    </div>
                    {expanded && t && details && (
                      <div className="entry-detail">
                        <WorkoutPreview
                          template={t}
                          date={e.date}
                          prescriptions={details.prescriptions}
                          exercises={details.exercises}
                          doneSets={e.state === 'done' && e.sessionId ? details.sets.filter((x) => x.sessionId === e.sessionId) : null}
                        />
                        {e.state === 'done' && e.sessionId ? (
                          <button type="button" className="link" onClick={() => navigate(`/session/${e.sessionId}`)}>View workout</button>
                        ) : e.date === now ? (
                          <button type="button" className="link" onClick={() => void start(t, now)}>Start {t.kind === 'program' ? t.code : t.name}</button>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
              {selected && !isPast(d) && (
                <button type="button" className="link put" onClick={() => placeOn(d)}>Put here</button>
              )}
            </div>
          );
        })}
      </div>

      {missing.length > 0 && (
        <div className="card">
          <h2>Not scheduled this week</h2>
          <div className="chips">
            {missing.map((t: WorkoutTemplate) => (
              <button key={t.code} type="button" className={`secondary chip ${selected?.kind === 'template' && selected.code === t.code ? 'selected' : ''}`} onClick={() => setSelected({ kind: 'template', code: t.code })} disabled={weekOver}>
                + {t.code} · {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {mine.some((m) => !m.archived) && !weekOver && (
        <div className="card">
          <h2>Add one of your workouts</h2>
          <p className="muted small">Extra workouts are only placed where you put them.</p>
          <div className="chips">
            {mine.filter((m) => !m.archived).map((t) => (
              <button key={t.code} type="button" className={`secondary chip ${selected?.kind === 'template' && selected.code === t.code ? 'selected' : ''}`} onClick={() => setSelected({ kind: 'template', code: t.code })}>
                + {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {(warnings.length > 0 || draft.notes.length > 0) && (
        <div className="card">
          <h2>Why this plan</h2>
          <ul className="reasons">
            {warnings.map((w, i) => <li key={`w${i}`} className={w.severity}>{w.message}</li>)}
            {!draft.manual && draft.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      )}

      {!weekOver && (
        <div className="buttons sticky-actions">
          <button type="button" onClick={() => void save()} disabled={!draft.dirty}>Save week</button>
          <button type="button" className="secondary" onClick={() => replan(draft.restDays, draft.unavailableDays)}>Re-plan week</button>
        </div>
      )}
    </section>
  );
}
