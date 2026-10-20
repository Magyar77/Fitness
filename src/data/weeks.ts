// Loading, proposing and saving a week plan.

import { addDays, weekDates, type IsoDate } from '../engine/dates';
import type { ProgramVersion, WeekPlan, WeekPlanEntry, WorkoutTemplate } from '../engine/model';
import { generateWeek, settingsForProgram, validateWeek, type ScheduleProposal, type ScheduleWarning } from '../engine/scheduling';
import type { FitnessDB } from './db';

export interface WeekContext {
  weekStart: IsoDate;
  plan: WeekPlan | undefined;
  /** Completed workouts this week (from the plan or found in history). */
  completed: WeekPlanEntry[];
  /** Workouts on the last days of the previous week, for recovery across the weekend. */
  previousTail: WeekPlanEntry[];
  /** Rest days to start from: the saved plan's, else last week's pattern, else Sunday. */
  suggestedRest: IsoDate[];
}

function inRange(date: IsoDate, start: IsoDate): boolean {
  return date >= start && date <= addDays(start, 6);
}

async function completedIn(db: FitnessDB, weekStart: IsoDate, plan: WeekPlan | undefined): Promise<WeekPlanEntry[]> {
  const sessions = await db.sessions.where('date').between(weekStart, addDays(weekStart, 6), true, true).toArray();
  return sessions
    .filter((s) => s.status === 'completed' && s.templateCode)
    .map((s): WeekPlanEntry => {
      const fromPlan = plan?.entries.find((e) => e.sessionId === s.id);
      return { date: s.date, templateCode: s.templateCode!, origin: fromPlan?.origin ?? 'manual', state: 'done', sessionId: s.id };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function loadWeekContext(db: FitnessDB, weekStart: IsoDate): Promise<WeekContext> {
  const prevStart = addDays(weekStart, -7);
  const [plan, prevPlan] = await Promise.all([db.weekPlans.get(weekStart), db.weekPlans.get(prevStart)]);
  const completed = await completedIn(db, weekStart, plan);
  const prevCompleted = await completedIn(db, prevStart, prevPlan);

  const tailStart = addDays(weekStart, -2);
  const tail = new Map<string, WeekPlanEntry>();
  for (const e of [...(prevPlan?.entries ?? []), ...prevCompleted]) {
    if (e.state === 'skipped' || e.date < tailStart) continue;
    tail.set(e.sessionId ?? `${e.date}:${e.templateCode}`, e);
  }

  const suggestedRest = plan
    ? plan.restDays
    : prevPlan
      ? prevPlan.restDays.map((d) => addDays(d, 7)).filter((d) => inRange(d, weekStart))
      : [addDays(weekStart, 6)];

  return { weekStart, plan, completed, previousTail: [...tail.values()], suggestedRest };
}

/** New workouts are only placed from `today` on; a past week gets none. */
export function earliestFor(weekStart: IsoDate, today: IsoDate): IsoDate {
  return today > weekStart ? today : weekStart;
}

export function proposeWeek(
  ctx: WeekContext,
  program: ProgramVersion,
  restDays: IsoDate[],
  unavailableDays: IsoDate[],
  today: IsoDate,
): ScheduleProposal {
  return generateWeek({
    weekStart: ctx.weekStart,
    restDays,
    unavailableDays,
    templates: program.templates,
    fixed: ctx.completed,
    earliest: earliestFor(ctx.weekStart, today),
    previousWeek: ctx.previousTail,
    settings: settingsForProgram(program),
  });
}

export function checkWeek(ctx: WeekContext, templates: WorkoutTemplate[], entries: WeekPlanEntry[], restDays: IsoDate[], unavailableDays: IsoDate[]): ScheduleWarning[] {
  return validateWeek({ weekStart: ctx.weekStart, entries, restDays, unavailableDays, templates, previousWeek: ctx.previousTail });
}

/** Program workouts not on the plan (or skipped) this week. */
export function unplaced(templates: WorkoutTemplate[], entries: WeekPlanEntry[]): WorkoutTemplate[] {
  const placed = new Set(entries.filter((e) => e.state !== 'skipped').map((e) => e.templateCode));
  return templates.filter((t) => t.kind === 'program' && !placed.has(t.code));
}

export async function saveWeek(db: FitnessDB, plan: WeekPlan): Promise<void> {
  const days = new Set(weekDates(plan.weekStart));
  for (const e of plan.entries) if (!days.has(e.date)) throw new Error(`${e.date} is outside this week.`);
  await db.weekPlans.put({ ...plan, status: 'saved', entries: [...plan.entries].sort((a, b) => a.date.localeCompare(b.date)) });
}
