// Personal records, found automatically from logged sets. Deterministic: the same history
// always gives the same records. A record needs earlier history of the exercise, so the
// very first session of something is a starting point, not a pile of "records".

import type { IsoDate } from './dates';
import type { Exercise, SetLog, WorkoutSession } from './model';
import { exerciseHistory, metricFor, type HistoryEntry, type Series } from './stats';
import { barOffset, formatLoad, toDisplay, type Unit } from './units';

export type RecordKind = 'weight' | 'e1rm' | 'reps' | 'time' | 'assist';

export interface PersonalRecord {
  exerciseId: string;
  kind: RecordKind;
  /** kg (total, bar included when counted), reps or seconds. */
  value: number;
  /** e.g. "62.5 kg × 8". */
  label: string;
  date: IsoDate;
  sessionId: string;
  /** The record it beat, if any. */
  previous: number | null;
}

export const RECORD_LABEL: Record<RecordKind, string> = {
  weight: 'Heaviest weight',
  e1rm: 'Estimated 1-rep max',
  reps: 'Most reps in a set',
  time: 'Longest hold',
  assist: 'Least assistance',
};

/** Epley estimate of a one-rep max; only from sets of 1–12 reps, where it is reasonably reliable. */
export function estimate1rm(kg: number, reps: number): number | null {
  if (!(kg > 0) || !Number.isInteger(reps) || reps < 1 || reps > 12) return null;
  return reps === 1 ? kg : Math.round(kg * (1 + reps / 30) * 10) / 10;
}

const WEIGHTED = new Set(['plates', 'barbell_total', 'dumbbell_per_hand', 'machine', 'cable']);

function kindsFor(e: Exercise): RecordKind[] {
  const m = metricFor(e);
  if (m === 'time') return ['time'];
  if (m === 'assist') return ['assist'];
  if (m === 'reps') return ['reps'];
  if (m === 'load' && e.measure === 'reps' && WEIGHTED.has(e.loadType)) return ['weight', 'e1rm'];
  if (m === 'load') return ['weight'];
  return [];
}

interface Candidate {
  value: number;
  label: string;
}

/** The best of each kind within one session's sets of an exercise. */
function sessionBests(sets: SetLog[], e: Exercise, unit: Unit, barKg: number | null): Partial<Record<RecordKind, Candidate>> {
  const bar = barOffset(e, barKg);
  const kg = (v: number) => formatLoad(v, unit);
  const valid = sets.filter((s) => s.completed && !s.isWarmup && s.techniqueOk !== false);
  const out: Partial<Record<RecordKind, Candidate>> = {};
  const keep = (k: RecordKind, c: Candidate, lowerIsBetter = false) => {
    const cur = out[k];
    if (!cur || (lowerIsBetter ? c.value < cur.value : c.value > cur.value)) out[k] = c;
  };
  for (const s of valid) {
    for (const k of kindsFor(e)) {
      if (k === 'weight' && typeof s.weightKg === 'number' && ((s.reps ?? 0) > 0 || (s.distanceM ?? 0) > 0)) {
        const total = s.weightKg + bar;
        keep('weight', { value: total, label: e.measure === 'distance' ? `${kg(total)} × ${s.distanceM} m` : `${kg(total)} × ${s.reps}` });
      } else if (k === 'e1rm' && typeof s.weightKg === 'number' && typeof s.reps === 'number') {
        const est = estimate1rm(s.weightKg + bar, s.reps);
        if (est !== null) keep('e1rm', { value: est, label: `${kg(est)} (from ${kg(s.weightKg + bar)} × ${s.reps})` });
      } else if (k === 'reps' && typeof s.reps === 'number' && s.reps > 0) {
        keep('reps', { value: s.reps, label: `${s.reps} reps` });
      } else if (k === 'time' && typeof s.durationSec === 'number' && s.durationSec > 0) {
        keep('time', { value: s.durationSec, label: `${s.durationSec} s` });
      } else if (k === 'assist' && typeof s.assistKg === 'number' && (s.reps ?? 0) > 0) {
        keep('assist', { value: s.assistKg, label: `${kg(s.assistKg)} assist × ${s.reps}` }, true);
      }
    }
  }
  return out;
}

const better = (k: RecordKind, a: number, b: number) => (k === 'assist' ? a < b - 1e-9 : a > b + 1e-9);

/** Walks the history in order and returns every record set (each beat everything before it). */
export function recordTimeline(history: HistoryEntry[], e: Exercise, unit: Unit = 'kg', barKg: number | null = null): PersonalRecord[] {
  const best = new Map<RecordKind, number>();
  const out: PersonalRecord[] = [];
  history.forEach((h, i) => {
    const bests = sessionBests(h.sets, e, unit, barKg);
    for (const [k, c] of Object.entries(bests) as [RecordKind, Candidate][]) {
      const prev = best.get(k);
      if (prev === undefined || better(k, c.value, prev)) {
        if (i > 0 && prev !== undefined) out.push({ exerciseId: e.id, kind: k, value: c.value, label: c.label, date: h.date, sessionId: h.sessionId, previous: prev });
        best.set(k, c.value);
      }
    }
  });
  return out;
}

/** Current best per kind, including the first session's (so every exercise has a "best"). */
export function currentBests(history: HistoryEntry[], e: Exercise, unit: Unit = 'kg', barKg: number | null = null): PersonalRecord[] {
  const best = new Map<RecordKind, PersonalRecord>();
  for (const h of history) {
    for (const [k, c] of Object.entries(sessionBests(h.sets, e, unit, barKg)) as [RecordKind, Candidate][]) {
      const prev = best.get(k);
      if (!prev || better(k, c.value, prev.value)) best.set(k, { exerciseId: e.id, kind: k, value: c.value, label: c.label, date: h.date, sessionId: h.sessionId, previous: prev?.value ?? null });
    }
  }
  return kindsFor(e).map((k) => best.get(k)).filter((r): r is PersonalRecord => !!r);
}

/** Records set in one session, across all its exercises. */
export function recordsInSession(sessionId: string, histories: Map<string, { exercise: Exercise; history: HistoryEntry[] }>, unit: Unit = 'kg', barKg: number | null = null): PersonalRecord[] {
  const out: PersonalRecord[] = [];
  for (const { exercise, history } of histories.values()) {
    if (!history.some((h) => h.sessionId === sessionId)) continue;
    out.push(...recordTimeline(history, exercise, unit, barKg).filter((r) => r.sessionId === sessionId));
  }
  return out;
}

/** "+2.5 kg", "+3 reps", "−5 kg assist": how much a record improved. */
export function improvement(r: PersonalRecord, unit: Unit): string {
  if (r.previous === null) return '';
  const d = Math.abs(r.value - r.previous);
  if (r.kind === 'reps') return `+${d} rep${d === 1 ? '' : 's'}`;
  if (r.kind === 'time') return `+${d} s`;
  if (r.kind === 'assist') return `−${formatLoad(d, unit)} assist`;
  return `+${formatLoad(d, unit)}`;
}

/** One point per session: the best estimated 1-rep max. For the progress chart. */
export function e1rmSeries(history: HistoryEntry[], e: Exercise, unit: Unit = 'kg', barKg: number | null = null): Series {
  const points = history.flatMap((h) => {
    const c = sessionBests(h.sets, e, unit, barKg).e1rm;
    return c ? [{ date: h.date, sessionId: h.sessionId, value: toDisplay(c.value, unit), label: c.label, work: 0 }] : [];
  });
  const best = points.reduce<(typeof points)[number] | null>((b, p) => (!b || p.value >= b.value ? p : b), null);
  return { metric: 'load', title: 'Estimated 1-rep max', unit, lowerIsBetter: false, points, best };
}

/** For sessions: every exercise's history, keyed by exercise id. */
export function historiesBy(exercises: Map<string, Exercise>, sets: SetLog[], build: (e: Exercise) => HistoryEntry[]): Map<string, { exercise: Exercise; history: HistoryEntry[] }> {
  const ids = new Set(sets.map((s) => s.exerciseId));
  const out = new Map<string, { exercise: Exercise; history: HistoryEntry[] }>();
  for (const id of ids) {
    const e = exercises.get(id);
    if (e) out.set(id, { exercise: e, history: build(e) });
  }
  return out;
}

/** All records across exercises, newest first, plus each exercise's current bests. */
export function allRecords(exercises: Map<string, Exercise>, sessions: WorkoutSession[], sets: SetLog[], unit: Unit = 'kg', barKg: number | null = null): { timeline: PersonalRecord[]; bests: Map<string, PersonalRecord[]> } {
  const histories = historiesBy(exercises, sets, (e) => exerciseHistory(sessions, sets, e, unit, barKg));
  const timeline: PersonalRecord[] = [];
  const bests = new Map<string, PersonalRecord[]>();
  for (const { exercise, history } of histories.values()) {
    if (!history.length) continue;
    timeline.push(...recordTimeline(history, exercise, unit, barKg));
    bests.set(exercise.id, currentBests(history, exercise, unit, barKg));
  }
  timeline.sort((a, b) => b.date.localeCompare(a.date) || a.exerciseId.localeCompare(b.exerciseId));
  return { timeline, bests };
}

/** Records set in one session. */
export function sessionRecords(sessionId: string, exercises: Map<string, Exercise>, sessions: WorkoutSession[], sets: SetLog[], unit: Unit = 'kg', barKg: number | null = null): PersonalRecord[] {
  const mine = new Set(sets.filter((s) => s.sessionId === sessionId).map((s) => s.exerciseId));
  const relevant = sets.filter((s) => mine.has(s.exerciseId));
  return recordsInSession(sessionId, historiesBy(exercises, relevant, (e) => exerciseHistory(sessions, relevant, e, unit, barKg)), unit, barKg);
}
