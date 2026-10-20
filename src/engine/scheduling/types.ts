import type { IsoDate } from '../dates';
import type { WeekPlanEntry, WorkoutTemplate } from '../model';

export interface ScheduleSettings {
  /**
   * Preferred weekly order. Default follows the coach's Week 2 rule: the main pull-up
   * day (C) goes first after rest, the rest keeps program order.
   */
  referenceOrder: string[];
  /** Which workouts to keep when there are fewer days than workouts (most important first). */
  keepPriority: string[];
}

export const DEFAULT_SCHEDULE_SETTINGS: ScheduleSettings = {
  referenceOrder: ['C', 'A', 'B', 'E', 'D'],
  keepPriority: ['C', 'A', 'D', 'B', 'E'],
};

export interface ScheduleInput {
  weekStart: IsoDate;
  restDays: IsoDate[];
  unavailableDays: IsoDate[];
  /** Program workouts to place this week. */
  templates: WorkoutTemplate[];
  /** Entries already fixed this week (done, or manually placed and kept). */
  fixed: WeekPlanEntry[];
  /** New workouts may not be placed before this date (e.g. today). */
  earliest?: IsoDate;
  /** Last days of the previous week, for recovery across the weekend. */
  previousWeek: WeekPlanEntry[];
  settings: ScheduleSettings;
}

export type Severity = 'conflict' | 'warning' | 'info';

export interface ScheduleWarning {
  severity: Severity;
  code:
    | 'rest_day'
    | 'unavailable_day'
    | 'same_day'
    | 'duplicate_workout'
    | 'hard_streak'
    | 'pull_before_main'
    | 'main_not_fresh'
    | 'upper_back_to_back'
    | 'too_many_days'
    | 'omitted'
    | 'outside_week'
    | 'unknown_workout';
  date?: IsoDate;
  message: string;
}

export interface Omission {
  templateCode: string;
  reason: string;
}

export interface ScheduleProposal {
  weekStart: IsoDate;
  entries: WeekPlanEntry[];
  omitted: Omission[];
  freeDays: IsoDate[];
  notes: string[];
  warnings: ScheduleWarning[];
  score: number;
}

/**
 * Scheduling preferences for a program: its own if set; Program v2 keeps the coach's C-first
 * rule (edited versions of it copy that setting); anything else follows its canonical order.
 */
export function settingsForProgram(program: { id: string; canonicalOrder: string[]; schedule?: ScheduleSettings }): ScheduleSettings {
  if (program.schedule) return program.schedule;
  if (program.id === 'program-v2') return DEFAULT_SCHEDULE_SETTINGS;
  return { referenceOrder: program.canonicalOrder, keepPriority: program.canonicalOrder };
}
