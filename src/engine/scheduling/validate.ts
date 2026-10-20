// Checks any week (generated, manually edited, or with custom workouts) and explains problems.

import { addDays, daysBetween, weekdayName, type IsoDate } from '../dates';
import type { WeekPlanEntry, WorkoutTemplate } from '../model';
import type { ScheduleWarning } from './types';

export interface ValidateInput {
  weekStart: IsoDate;
  entries: WeekPlanEntry[];
  restDays: IsoDate[];
  unavailableDays: IsoDate[];
  /** Program and custom workouts, looked up by code. */
  templates: WorkoutTemplate[];
  previousWeek: WeekPlanEntry[];
}

const MAX_TRAINING_DAYS = 6;

export function label(t: WorkoutTemplate): string {
  return t.kind === 'program' ? `${t.code} (${t.name})` : t.name;
}

const upperWork = (t: WorkoutTemplate) => t.regions.includes('upper') && t.demand !== 'easy';
/** Back fatigue that costs next-day pull-up performance. */
const heavyPull = (t: WorkoutTemplate) => t.pullRole === 'main' || t.pullVolume;

export function validateWeek(input: ValidateInput): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  const byCode = new Map(input.templates.map((t) => [t.code, t]));
  const dayOf = (d: IsoDate) => daysBetween(input.weekStart, d);
  const dateOf = (n: number) => addDays(input.weekStart, n);
  const nameOf = (code: string) => {
    const t = byCode.get(code);
    return t ? label(t) : code;
  };

  const live = input.entries.filter((e) => e.state !== 'skipped');

  for (const e of live) {
    const name = nameOf(e.templateCode);
    if (!byCode.has(e.templateCode)) {
      warnings.push({ severity: 'conflict', code: 'unknown_workout', date: e.date, message: `Unknown workout "${e.templateCode}".` });
    }
    const n = dayOf(e.date);
    if (n < 0 || n > 6) warnings.push({ severity: 'conflict', code: 'outside_week', date: e.date, message: `${name} is outside this week.` });
    if (input.restDays.includes(e.date)) {
      warnings.push({ severity: 'conflict', code: 'rest_day', date: e.date, message: `${name} is on ${weekdayName(e.date)}, which you chose as a rest day.` });
    }
    if (input.unavailableDays.includes(e.date)) {
      warnings.push({ severity: 'conflict', code: 'unavailable_day', date: e.date, message: `${name} is on ${weekdayName(e.date)}, when you can't train.` });
    }
  }

  const perDay = new Map<IsoDate, WeekPlanEntry[]>();
  for (const e of live) perDay.set(e.date, [...(perDay.get(e.date) ?? []), e]);
  for (const [date, list] of [...perDay].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (list.length > 1) {
      warnings.push({
        severity: 'warning',
        code: 'same_day',
        date,
        message: `${list.length} workouts on ${weekdayName(date)} (${list.map((e) => nameOf(e.templateCode)).join(' + ')}). That's a long, demanding day.`,
      });
    }
  }

  const counts = new Map<string, number>();
  for (const e of live) counts.set(e.templateCode, (counts.get(e.templateCode) ?? 0) + 1);
  for (const [code, n] of counts) {
    if (n > 1 && byCode.get(code)?.kind === 'program') {
      warnings.push({ severity: 'warning', code: 'duplicate_workout', message: `${nameOf(code)} appears ${n} times this week.` });
    }
  }

  // Day-by-day timeline, including the end of last week (negative day numbers).
  const timeline = new Map<number, WorkoutTemplate[]>();
  for (const e of [...input.previousWeek.filter((p) => p.state !== 'skipped'), ...live]) {
    const t = byCode.get(e.templateCode);
    if (t) timeline.set(dayOf(e.date), [...(timeline.get(dayOf(e.date)) ?? []), t]);
  }
  const on = (n: number) => timeline.get(n) ?? [];

  for (const e of live) {
    const t = byCode.get(e.templateCode);
    if (!t || t.pullRole !== 'main') continue;
    const before = on(dayOf(e.date) - 1);
    const heavy = before.find(heavyPull);
    if (heavy) {
      warnings.push({
        severity: 'warning',
        code: 'pull_before_main',
        date: e.date,
        message: `${label(heavy)} the day before ${label(t)}: back and grip fatigue will cost pull-up performance.`,
      });
    } else if (before.length) {
      warnings.push({ severity: 'info', code: 'main_not_fresh', date: e.date, message: `${label(t)} follows a training day; it works best right after a day off.` });
    }
  }

  const firstDay = Math.min(0, ...timeline.keys());
  let streak = 0;
  for (let n = firstDay; n <= 6; n++) {
    streak = on(n).some((t) => t.demand === 'hard') ? streak + 1 : 0;
    if (streak === 3 && n >= 0) {
      warnings.push({ severity: 'warning', code: 'hard_streak', date: dateOf(n), message: `Three hard sessions in a row ending ${weekdayName(dateOf(n))}. Consider a lighter day in between.` });
    }
  }

  for (let n = 0; n <= 6; n++) {
    const today = on(n).find(upperWork);
    const yesterday = on(n - 1).find(upperWork);
    if (today && yesterday) {
      warnings.push({ severity: 'info', code: 'upper_back_to_back', date: dateOf(n), message: `Upper-body sessions on consecutive days (${label(yesterday)} → ${label(today)}).` });
    }
  }

  const trainingDays = new Set(live.map((e) => e.date)).size;
  if (trainingDays > MAX_TRAINING_DAYS) {
    warnings.push({ severity: 'warning', code: 'too_many_days', message: `${trainingDays} training days with no full rest day. Recovery may suffer.` });
  }

  return warnings;
}
