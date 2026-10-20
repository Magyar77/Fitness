// Progress statistics: exercise history, body weight, adherence, pull-up path, coaching notes.
// Pure functions over stored records; dates are passed in.

import { addDays, weekStart, type IsoDate } from './dates';
import type { BodyWeightEntry, Exercise, Prescription, SetLog, WeekPlan, WorkoutSession } from './model';
import { summarizeSets } from './logging';
import { formatLoad, toDisplay, type Unit } from './units';

const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// Exercise history

export interface HistoryEntry {
  date: IsoDate;
  sessionId: string;
  templateCode: string | null;
  sets: SetLog[];
  summary: string;
}

/** Completed sessions that include completed sets of this exercise, oldest first. */
export function exerciseHistory(sessions: WorkoutSession[], sets: SetLog[], exercise: Exercise, unit: Unit = 'kg'): HistoryEntry[] {
  const byId = new Map(sessions.filter((s) => s.status === 'completed').map((s) => [s.id, s]));
  const grouped = new Map<string, SetLog[]>();
  for (const s of sets) {
    if (s.exerciseId !== exercise.id || !s.completed || s.isWarmup || !byId.has(s.sessionId)) continue;
    grouped.set(s.sessionId, [...(grouped.get(s.sessionId) ?? []), s]);
  }
  return [...grouped]
    .map(([id, list]) => {
      const session = byId.get(id)!;
      const ordered = list.sort((a, b) => (a.slotKey ?? '').localeCompare(b.slotKey ?? '') || a.setIndex - b.setIndex);
      return { date: session.date, sessionId: id, templateCode: session.templateCode, sets: ordered, summary: summarizeSets(ordered, exercise, unit) };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
}

export type Metric = 'load' | 'assist' | 'reps' | 'time' | 'distance' | 'duration';

export interface SeriesPoint {
  date: IsoDate;
  sessionId: string;
  value: number;
  label: string;
  /** Total reps (or seconds/metres) done at that value: breaks ties for "best". */
  work: number;
}

export interface Series {
  metric: Metric;
  title: string;
  unit: string;
  /** For assistance, lower is better. */
  lowerIsBetter: boolean;
  points: SeriesPoint[];
  best: SeriesPoint | null;
}

const WEIGHTED = new Set(['plates', 'barbell_total', 'dumbbell_per_hand', 'machine', 'cable']);

export function metricFor(e: Exercise): Metric {
  if (e.measure === 'time') return 'time';
  if (e.measure === 'duration') return 'duration';
  if (e.measure === 'distance') return 'load';
  if (e.loadType === 'assisted_machine') return 'assist';
  if (WEIGHTED.has(e.loadType)) return 'load';
  return 'reps';
}

/** One point per session: the heaviest load (least assistance, most reps, longest hold) and what was done with it. Load values are in `unit`. */
export function exerciseSeries(history: HistoryEntry[], e: Exercise, unit: Unit = 'kg'): Series {
  const kg = (v: number) => formatLoad(v, unit);
  const metric = metricFor(e);
  const points: SeriesPoint[] = [];
  for (const h of history) {
    const valid = h.sets.filter((s) => s.techniqueOk !== false);
    let value: number | null = null;
    let label = '';
    let work = 0;
    if (metric === 'load') {
      const loaded = valid.filter((s) => typeof s.weightKg === 'number');
      if (loaded.length) {
        value = Math.max(...loaded.map((s) => s.weightKg!));
        const atTop = loaded.filter((s) => s.weightKg === value);
        work = atTop.reduce((sum, s) => sum + (e.measure === 'distance' ? (s.distanceM ?? 0) : (s.reps ?? 0)), 0);
        label = e.measure === 'distance' ? `${kg(value)} × ${atTop.map((s) => `${s.distanceM ?? '?'} m`).join(', ')}` : `${kg(value)} × ${atTop.map((s) => s.reps ?? '?').join('/')}`;
      }
    } else if (metric === 'assist') {
      const assisted = valid.filter((s) => typeof s.assistKg === 'number' && (s.reps ?? 0) > 0);
      if (assisted.length) {
        value = Math.min(...assisted.map((s) => s.assistKg!));
        const atBest = assisted.filter((s) => s.assistKg === value);
        work = atBest.reduce((sum, s) => sum + (s.reps ?? 0), 0);
        label = `${kg(value)} assist × ${atBest.map((s) => s.reps).join('/')}`;
      }
    } else if (metric === 'reps') {
      const reps = valid.map((s) => s.reps).filter((r): r is number => typeof r === 'number');
      if (reps.length) {
        value = Math.max(...reps);
        work = reps.reduce((a, b) => a + b, 0);
        label = `${reps.join('/')} reps`;
      }
    } else {
      const secs = valid.map((s) => s.durationSec).filter((t): t is number => typeof t === 'number');
      if (secs.length) {
        value = metric === 'duration' ? round1(Math.max(...secs) / 60) : Math.max(...secs);
        work = secs.reduce((a, b) => a + b, 0);
        label = metric === 'duration' ? `${value} min` : secs.map((t) => `${t} s`).join(', ');
      }
    }
    if (value !== null) points.push({ date: h.date, sessionId: h.sessionId, value: metric === 'load' || metric === 'assist' ? toDisplay(value, unit) : value, label, work });
  }
  const lowerIsBetter = metric === 'assist';
  // Best = best value; on a tie, more work at that value; on a further tie, the more recent.
  const better = (p: SeriesPoint, b: SeriesPoint) => (p.value !== b.value ? (lowerIsBetter ? p.value < b.value : p.value > b.value) : p.work >= b.work);
  const best = points.reduce<SeriesPoint | null>((b, p) => (!b || better(p, b) ? p : b), null);
  const titles: Record<Metric, [string, string]> = {
    load: ['Heaviest weight', unit],
    assist: ['Assistance used (less is better)', unit],
    reps: ['Best set (reps)', 'reps'],
    time: ['Longest hold', 's'],
    distance: ['Distance', 'm'],
    duration: ['Duration', 'min'],
  };
  return { metric, title: titles[metric][0], unit: titles[metric][1], lowerIsBetter, points, best };
}

// ---------------------------------------------------------------------------
// Body weight

export interface WeeklyAverage {
  weekStart: IsoDate;
  average: number;
  count: number;
}

export function weeklyAverages(entries: BodyWeightEntry[]): WeeklyAverage[] {
  const weeks = new Map<IsoDate, number[]>();
  for (const e of entries) weeks.set(weekStart(e.date), [...(weeks.get(weekStart(e.date)) ?? []), e.kg]);
  return [...weeks]
    .map(([w, list]) => ({ weekStart: w, average: round1(list.reduce((a, b) => a + b, 0) / list.length), count: list.length }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

/** Change between the two most recent weekly averages (null until there are two weeks). */
export function weeklyChange(averages: WeeklyAverage[]): number | null {
  if (averages.length < 2) return null;
  return round1(averages.at(-1)!.average - averages.at(-2)!.average);
}

// ---------------------------------------------------------------------------
// Planned versus completed

export interface WeekAdherence {
  weekStart: IsoDate;
  planned: number;
  done: number;
  skipped: number;
  missed: number;
  /** Completed workouts that were not on the plan. */
  extra: number;
}

export function adherence(plans: WeekPlan[], sessions: WorkoutSession[], today: IsoDate): WeekAdherence[] {
  const completed = sessions.filter((s) => s.status === 'completed');
  return [...plans]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((p) => {
      const live = p.entries.filter((e) => e.state !== 'skipped');
      const done = live.filter((e) => e.state === 'done');
      const linked = new Set(done.map((e) => e.sessionId));
      const inWeek = completed.filter((s) => s.date >= p.weekStart && s.date <= addDays(p.weekStart, 6));
      return {
        weekStart: p.weekStart,
        planned: live.length,
        done: done.length,
        skipped: p.entries.length - live.length,
        missed: live.filter((e) => e.state === 'planned' && e.date < today).length,
        extra: inWeek.filter((s) => !linked.has(s.id)).length,
      };
    });
}

// ---------------------------------------------------------------------------
// Pull-up path

export interface Milestone {
  id: 'dead-hang' | 'scapular' | 'negatives' | 'assisted';
  name: string;
  target: string;
  current: string;
  met: boolean;
  date: IsoDate | null;
}

export interface PullUpStatus {
  milestones: Milestone[];
  readyToTest: boolean;
  strictPullUps: { date: IsoDate; reps: number } | null;
}

function latestSession(sessions: WorkoutSession[], sets: SetLog[], exerciseId: string): { date: IsoDate; sets: SetLog[] } | null {
  const done = new Map(sessions.filter((s) => s.status === 'completed').map((s) => [s.id, s]));
  const relevant = sets.filter((s) => s.exerciseId === exerciseId && s.completed && !s.isWarmup && done.has(s.sessionId));
  if (!relevant.length) return null;
  const latest = relevant.map((s) => done.get(s.sessionId)!).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).at(-1)!;
  return { date: latest.date, sets: relevant.filter((s) => s.sessionId === latest.id).sort((a, b) => a.setIndex - b.setIndex) };
}

/** The four steps from the coaching document, checked against what was actually logged. */
export function pullUpStatus(sessions: WorkoutSession[], sets: SetLog[], unit: Unit = 'kg'): PullUpStatus {
  const kg = (v: number) => formatLoad(v, unit);
  const completedIds = new Set(sessions.filter((s) => s.status === 'completed').map((s) => s.id));
  const date = (id: string) => sessions.find((s) => s.id === id)?.date ?? null;

  const hangs = sets.filter((s) => s.exerciseId === 'dead-hang' && s.completed && completedIds.has(s.sessionId) && typeof s.durationSec === 'number');
  const bestHang = hangs.reduce<SetLog | null>((b, s) => (!b || s.durationSec! > b.durationSec! ? s : b), null);

  const scap = latestSession(sessions, sets, 'scapular-pull-up');
  const neg = latestSession(sessions, sets, 'assisted-negative-pull-up');
  const ast = latestSession(sessions, sets, 'assisted-pull-up');
  const strict = latestSession(sessions, sets, 'pull-up');

  const negAssist = neg ? Math.min(...neg.sets.map((s) => s.assistKg ?? Infinity)) : null;
  const astAssist = ast ? Math.min(...ast.sets.map((s) => s.assistKg ?? Infinity)) : null;
  const astAtLoad = ast ? ast.sets.filter((s) => s.assistKg === astAssist) : [];

  const milestones: Milestone[] = [
    {
      id: 'dead-hang',
      name: 'Dead hang',
      target: '45–60 s',
      current: bestHang ? `best ${bestHang.durationSec} s` : 'no record yet',
      met: (bestHang?.durationSec ?? 0) >= 45,
      date: bestHang ? date(bestHang.sessionId) : null,
    },
    {
      id: 'scapular',
      name: 'Scapular pull-ups',
      target: '2 × 10 with a clear 1 s pause',
      current: scap ? `${scap.sets.map((s) => s.reps ?? '?').join('/')}${scap.sets.every((s) => s.pauseHeld === true) ? ', pause held' : scap.sets.some((s) => s.pauseHeld === false) ? ', pause not yet held' : ''}` : 'no record yet',
      met: !!scap && scap.sets.filter((s) => (s.reps ?? 0) >= 10 && s.pauseHeld === true).length >= 2,
      date: scap?.date ?? null,
    },
    {
      id: 'negatives',
      name: 'Assisted negatives',
      target: '4 × 3 unassisted at 5 s each',
      current: neg && negAssist !== null && Number.isFinite(negAssist) ? `${neg.sets.length} × ${neg.sets[0]?.reps ?? '?'} at ${negAssist === 0 ? 'no assistance' : `${kg(negAssist)} assist`}${neg.sets.every((s) => s.tempoMet === true) ? ', full 5 s' : ''}` : 'no record yet',
      met: !!neg && neg.sets.filter((s) => (s.assistKg ?? 0) === 0 && (s.reps ?? 0) >= 3 && s.tempoMet === true).length >= 4,
      date: neg?.date ?? null,
    },
    {
      id: 'assisted',
      name: 'Assisted pull-ups',
      target: `3 × 8 at ≤ ${unit === 'kg' ? '20 kg' : '45 lb'} assistance`,
      current: ast && astAssist !== null && Number.isFinite(astAssist) ? `${astAtLoad.map((s) => s.reps ?? '?').join('/')} at ${kg(astAssist)} assist` : 'no record yet',
      met: astAssist !== null && astAssist <= 20.5 && astAtLoad.filter((s) => (s.reps ?? 0) >= 8).length >= 3,
      date: ast?.date ?? null,
    },
  ];

  const strictBest = strict ? Math.max(...strict.sets.map((s) => s.reps ?? 0)) : 0;
  return {
    milestones,
    readyToTest: milestones.every((m) => m.met),
    strictPullUps: strict && strictBest > 0 ? { date: strict.date, reps: strictBest } : null,
  };
}

// ---------------------------------------------------------------------------
// Recent progress and coaching notes

export interface ProgressItem {
  date: IsoDate;
  name: string;
  text: string;
}

/**
 * Targets that got harder (more weight, less assistance, longer hold), newest first.
 * `nameOf` turns a slot key or link group into an exercise name.
 */
export function recentProgress(prescriptions: Prescription[], nameOf: (scope: string) => string, limit = 5): ProgressItem[] {
  const byScope = new Map<string, Prescription[]>();
  for (const p of prescriptions) {
    if (p.status !== 'active') continue;
    const scope = p.linkGroup ?? p.slotKey!;
    byScope.set(scope, [...(byScope.get(scope) ?? []), p]);
  }
  const items: ProgressItem[] = [];
  for (const [scope, list] of byScope) {
    const sorted = list.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    for (let i = 1; i < sorted.length; i++) {
      const [a, b] = [sorted[i - 1]!, sorted[i]!];
      const heavier = typeof a.loadKg === 'number' && typeof b.loadKg === 'number' && b.loadKg > a.loadKg;
      const lessHelp = typeof a.assistKg === 'number' && typeof b.assistKg === 'number' && b.assistKg < a.assistKg;
      const longer = typeof a.timeSec === 'number' && typeof b.timeSec === 'number' && b.timeSec > a.timeSec;
      if (heavier || lessHelp || longer) items.push({ date: b.effectiveFrom, name: nameOf(scope), text: b.text });
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)).slice(0, limit);
}

export interface CoachingInput {
  today: IsoDate;
  unit?: Unit;
  lastSession: { session: WorkoutSession; sets: SetLog[] } | null;
  pending: number;
  bodyWeights: BodyWeightEntry[];
  /** null when the first pull-up is not one of the goals. */
  pullUp: PullUpStatus | null;
  /** Remind about weighing in (fat-loss goal, or already logging body weight). Default true. */
  trackBodyWeight?: boolean;
}

/** A few rule-based notes for the dashboard, most important first. */
export function coachingNotes(input: CoachingInput): string[] {
  const notes: string[] = [];
  if (input.pullUp?.readyToTest) notes.push('All pull-up milestones are met: test a strict pull-up fresh at the start of your next C session.');
  if (input.pending > 0) notes.push(`${input.pending} recommendation${input.pending === 1 ? '' : 's'} need${input.pending === 1 ? 's' : ''} your OK before the targets change.`);

  const last = input.lastSession;
  if (last) {
    const failures = last.sets.filter((s) => s.completed && s.rir && s.rir.max === 0).length;
    if (failures >= 3) notes.push(`${failures} sets ended at RIR 0 last workout. Finish 1–2 reps earlier to keep progressing longer.`);
    const sharp = last.session.discomfort.filter((d) => d.severity === 'sharp');
    if (sharp.length) notes.push('You reported sharp pain last workout: use the alternative exercise and review it before it progresses.');
    if (last.session.fatigue !== null && last.session.fatigue >= 4) notes.push('Last workout felt very hard. Targets were held; prioritise sleep and food before the next one.');
  }

  const thisWeek = input.bodyWeights.filter((b) => weekStart(b.date) === weekStart(input.today)).length;
  if (thisWeek === 0 && input.trackBodyWeight !== false) notes.push('No body weight logged this week. Weigh 2–3 mornings (after the toilet, before food) for a reliable weekly average.');
  const change = weeklyChange(weeklyAverages(input.bodyWeights));
  const w = (v: number) => formatLoad(Math.abs(v), input.unit ?? 'kg');
  if (change !== null) {
    notes.push(
      change < 0
        ? `Weekly average body weight is down ${w(change)}. Judge fat loss over 3–4 weeks, not single days.`
        : change > 0
          ? `Weekly average body weight is up ${w(change)}. One week is noise; look at the 3–4 week trend.`
          : 'Weekly average body weight is unchanged from last week.',
    );
  }

  const next = input.pullUp?.milestones.find((m) => !m.met);
  if (next && !input.pullUp?.readyToTest) notes.push(`Pull-up path: next milestone is ${next.name.toLowerCase()}, ${next.target} (now: ${next.current}).`);
  return notes;
}
