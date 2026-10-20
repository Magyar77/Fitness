// Weekly schedule generator: places the program's workouts on the available days.
// Exhaustive search (≤ 7 days × 5 workouts ≈ 2,520 assignments), deterministic tie-breaks.
// Never creates workouts to fill free days.

import { addDays, daysBetween, weekDates, weekdayName, type IsoDate } from '../dates';
import type { WeekPlanEntry, WorkoutTemplate } from '../model';
import type { Omission, ScheduleInput, ScheduleProposal, ScheduleWarning } from './types';
import { label, validateWeek } from './validate';

const W_ORDER = 10; // per pair out of the reference order: keeps the program's structure
const W_MAIN_AFTER_TRAINING = 3; // main pull-up day not right after rest
const W_MAIN_AFTER_PULL = 5; // loaded pulling the day before the main pull-up day
const W_PULL_AFTER_MAIN = 2; // loaded pulling the day after the main pull-up day
const W_UPPER_PAIR = 1; // upper-body sessions on consecutive days
const W_HARD_PAIR = 1; // hard sessions on consecutive days

const upperWork = (t: WorkoutTemplate) => t.regions.includes('upper') && t.demand !== 'easy';
const heavyPull = (t: WorkoutTemplate) => t.pullRole === 'main' || t.pullVolume;

function* combinations<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) yield* combinations(items, k, i + 1, [...acc, items[i]!]);
}

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const p of permutations(rest)) yield [items[i]!, ...p];
  }
}

function omissionReason(t: WorkoutTemplate): string {
  if (t.easyDay) return 'easy recovery day, the least critical session';
  if (t.regions.includes('lower')) return 'lower-body strength work pauses this week';
  if (t.pullVolume) return 'extra upper-body and grip volume; pull-up practice continues in the kept sessions';
  if (t.pullRole === 'light') return 'pressing and light pull-up practice';
  return 'lower priority than the kept workouts';
}

export function generateWeek(input: ScheduleInput): ScheduleProposal {
  const { weekStart, settings } = input;
  const dates = weekDates(weekStart);
  const blocked = new Set([...input.restDays, ...input.unavailableDays]);
  const fixed = input.fixed.filter((e) => e.state !== 'skipped');
  const fixedDates = new Set(fixed.map((e) => e.date));
  const fixedCodes = new Set(fixed.map((e) => e.templateCode));
  const byCode = new Map(input.templates.map((t) => [t.code, t]));

  const free = dates.filter((d) => !blocked.has(d) && !fixedDates.has(d) && (!input.earliest || d >= input.earliest));
  const rank = (list: string[], code: string) => {
    const i = list.indexOf(code);
    return i === -1 ? list.length : i;
  };
  const pool = input.templates
    .filter((t) => !fixedCodes.has(t.code))
    .sort((a, b) => rank(settings.keepPriority, a.code) - rank(settings.keepPriority, b.code) || rank(settings.referenceOrder, a.code) - rank(settings.referenceOrder, b.code));
  const k = Math.min(free.length, pool.length);
  const kept = pool.slice(0, k).sort((a, b) => rank(settings.referenceOrder, a.code) - rank(settings.referenceOrder, b.code));
  const omittedTemplates = pool.slice(k);

  // Context that does not change between candidates: last week and fixed entries.
  const context = new Map<number, WorkoutTemplate[]>();
  for (const e of [...input.previousWeek.filter((p) => p.state !== 'skipped'), ...fixed]) {
    const t = byCode.get(e.templateCode);
    if (t) {
      const n = daysBetween(weekStart, e.date);
      context.set(n, [...(context.get(n) ?? []), t]);
    }
  }
  const fixedThisWeek = fixed
    .map((e) => ({ n: daysBetween(weekStart, e.date), t: byCode.get(e.templateCode) }))
    .filter((x): x is { n: number; t: WorkoutTemplate } => x.t !== undefined);

  function score(days: IsoDate[], order: WorkoutTemplate[]): number {
    const timeline = new Map(context);
    days.forEach((d, i) => {
      const n = daysBetween(weekStart, d);
      timeline.set(n, [...(timeline.get(n) ?? []), order[i]!]);
    });
    const on = (n: number) => timeline.get(n) ?? [];
    let s = 0;

    // Order: all of this week's workouts by date versus the reference order.
    const sequence = [...fixedThisWeek, ...days.map((d, i) => ({ n: daysBetween(weekStart, d), t: order[i]! }))]
      .sort((a, b) => a.n - b.n)
      .map((x) => rank(settings.referenceOrder, x.t.code));
    for (let i = 0; i < sequence.length; i++) for (let j = i + 1; j < sequence.length; j++) if (sequence[i]! > sequence[j]!) s += W_ORDER;

    for (let n = 0; n <= 6; n++) {
      for (const t of on(n)) {
        if (t.pullRole === 'main') {
          if (on(n - 1).length) s += W_MAIN_AFTER_TRAINING;
          if (on(n - 1).some(heavyPull)) s += W_MAIN_AFTER_PULL;
          if (on(n + 1).some((x) => x.pullVolume && x.pullRole !== 'main')) s += W_PULL_AFTER_MAIN;
        }
      }
      if (on(n).some(upperWork) && on(n - 1).some(upperWork)) s += W_UPPER_PAIR;
      if (on(n).some((t) => t.demand === 'hard') && on(n - 1).some((t) => t.demand === 'hard')) s += W_HARD_PAIR;
    }
    return s;
  }

  let best: { days: IsoDate[]; order: WorkoutTemplate[]; score: number } | null = null;
  if (k > 0) {
    for (const days of combinations(free, k)) {
      for (const order of permutations(kept)) {
        const s = score(days, order);
        if (!best || s < best.score) best = { days, order, score: s };
      }
    }
  }

  const generated: WeekPlanEntry[] = best
    ? best.days.map((date, i) => ({ date, templateCode: best!.order[i]!.code, origin: 'generated' as const, state: 'planned' as const }))
    : [];
  const entries = [...fixed, ...generated].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Explanations
  const notes: string[] = [];
  const omitted: Omission[] = omittedTemplates.map((t) => ({ templateCode: t.code, reason: omissionReason(t) }));
  const available = free.length;
  for (const e of fixed) notes.push(`${label(byCode.get(e.templateCode) ?? fallback(e.templateCode))} already ${e.state === 'done' ? 'done' : 'set'} on ${weekdayName(e.date)}.`);
  if (pool.length) {
    notes.push(`${available} training day${available === 1 ? '' : 's'} available for ${pool.length} workout${pool.length === 1 ? '' : 's'}.`);
  }
  for (const e of generated) {
    const t = byCode.get(e.templateCode)!;
    if (t.pullRole === 'main') {
      const before = addDays(e.date, -1);
      const trainedBefore = entries.some((x) => x.date === before) || input.previousWeek.some((x) => x.date === before && x.state !== 'skipped');
      notes.push(
        trainedBefore
          ? `${label(t)} on ${weekdayName(e.date)}. No rest day was available right before it.`
          : `${label(t)} on ${weekdayName(e.date)}, right after a day off: freshest for the top goal.`,
      );
    }
  }
  const freeDays = free.filter((d) => !generated.some((e) => e.date === d));
  if (freeDays.length) {
    notes.push(`${freeDays.map(weekdayName).join(', ')} ${freeDays.length === 1 ? 'stays' : 'stay'} free. No workout is added to fill ${freeDays.length === 1 ? 'it' : 'them'}.`);
  }
  if (omitted.length) {
    notes.push(
      `Only ${available} training day${available === 1 ? '' : 's'} for ${pool.length} workouts, so ${omitted.map((o) => label(byCode.get(o.templateCode)!)).join(' and ')} ${omitted.length === 1 ? 'is' : 'are'} left out (lowest priority).`,
    );
  }

  const warnings: ScheduleWarning[] = validateWeek({
    weekStart,
    entries,
    restDays: input.restDays,
    unavailableDays: input.unavailableDays,
    templates: input.templates,
    previousWeek: input.previousWeek,
  });
  if (pool.length && available === 0) {
    warnings.unshift({ severity: 'conflict', code: 'omitted', message: 'No training days are available this week, so no workouts are scheduled.' });
  }
  for (const o of omitted) {
    warnings.push({ severity: 'warning', code: 'omitted', message: `${label(byCode.get(o.templateCode)!)} is not scheduled: ${o.reason}.` });
  }

  return { weekStart, entries, omitted, freeDays, notes, warnings, score: best?.score ?? 0 };
}

function fallback(code: string): WorkoutTemplate {
  return { id: code, kind: 'custom', code, name: code, focus: '', pullUpWork: '', estMinutes: null, demand: 'moderate', regions: [], pullRole: 'none', pullVolume: false, gripLoad: false, easyDay: false, notes: [], slots: [] };
}
