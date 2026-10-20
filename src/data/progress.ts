// Everything the Progress screen and the dashboard read, plus body-weight entry.

import type { IsoDate } from '../engine/dates';
import type { BodyWeightEntry, Exercise, Prescription, SetLog, WeekPlan, WorkoutSession } from '../engine/model';
import type { FitnessDB } from './db';
import { allTemplates, exerciseMap } from './custom';

export interface ProgressData {
  sessions: WorkoutSession[];
  sets: SetLog[];
  prescriptions: Prescription[];
  bodyWeights: BodyWeightEntry[];
  plans: WeekPlan[];
  exercises: Map<string, Exercise>;
  /** Slot key or link group → exercise name. */
  nameOf: (scope: string) => string;
}

export async function loadProgress(db: FitnessDB): Promise<ProgressData> {
  const [sessions, sets, prescriptions, bodyWeights, plans, exercises, templates, archived] = await Promise.all([
    db.sessions.toArray(),
    db.sets.toArray(),
    db.prescriptions.toArray(),
    db.bodyWeights.toArray(),
    db.weekPlans.toArray(),
    exerciseMap(db),
    allTemplates(db),
    db.templates.toArray(),
  ]);
  const names = new Map<string, string>();
  for (const t of [...templates, ...archived]) {
    for (const s of t.slots) {
      names.set(s.slotKey, s.name);
      if (s.linkGroup) names.set(s.linkGroup, s.name);
    }
  }
  bodyWeights.sort((a, b) => a.date.localeCompare(b.date));
  return { sessions, sets, prescriptions, bodyWeights, plans, exercises, nameOf: (k) => names.get(k) ?? k };
}

export function validateBodyWeight(date: IsoDate, kg: number | null, today: IsoDate): string[] {
  const problems: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push('Choose a date.');
  else if (date > today) problems.push("The date can't be in the future.");
  if (kg === null || !(kg > 30 && kg < 300)) problems.push('Enter your weight in kg (30–300).');
  return problems;
}

/** One entry per day: saving the same date again replaces it. */
export async function saveBodyWeight(db: FitnessDB, entry: { date: IsoDate; kg: number; conditions?: string }, today: IsoDate): Promise<string[]> {
  const problems = validateBodyWeight(entry.date, entry.kg, today);
  if (problems.length) return problems;
  await db.bodyWeights.put({ date: entry.date, kg: Math.round(entry.kg * 10) / 10, ...(entry.conditions?.trim() ? { conditions: entry.conditions.trim() } : {}), source: 'manual' });
  return [];
}

export async function deleteBodyWeight(db: FitnessDB, date: IsoDate): Promise<void> {
  await db.bodyWeights.delete(date);
}
