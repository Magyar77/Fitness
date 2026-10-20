// The person using this device: goals, weight unit, and whether setup is done.

import type { Unit } from '../engine/units';
import type { FitnessDB } from './db';

export type Goal = 'first-pull-up' | 'lose-fat' | 'build-muscle' | 'get-stronger' | 'general-fitness';

export const GOALS: { id: Goal; label: string; help: string }[] = [
  { id: 'first-pull-up', label: 'First strict pull-up', help: 'Adds the pull-up path tracker' },
  { id: 'lose-fat', label: 'Lose body fat', help: 'Puts body weight and weekly averages up front' },
  { id: 'build-muscle', label: 'Build muscle', help: '' },
  { id: 'get-stronger', label: 'Get stronger', help: '' },
  { id: 'general-fitness', label: 'General fitness', help: '' },
];

export interface Profile {
  onboarded: boolean;
  unit: Unit;
  /** In priority order. */
  goals: Goal[];
  /** Barbell weights: the bar's weight when counting it (total), null when recording plates only. */
  barKg: number | null;
}

const KEY = 'profile';

/** Devices that had workouts before profiles existed keep their original setup. */
const EXISTING_USER: Profile = { onboarded: true, unit: 'kg', goals: ['first-pull-up', 'lose-fat', 'build-muscle'], barKg: null };
const NEW_USER: Profile = { onboarded: false, unit: 'kg', goals: [], barKg: 20 };

export async function getProfile(db: FitnessDB): Promise<Profile> {
  const row = await db.settings.get(KEY);
  // Profiles saved before the bar setting existed recorded plates only: keep that.
  if (row && typeof row.value === 'object' && row.value) return { ...NEW_USER, barKg: null, ...(row.value as Partial<Profile>) };
  return (await db.sessions.count()) > 0 ? EXISTING_USER : NEW_USER;
}

export async function saveProfile(db: FitnessDB, profile: Profile): Promise<void> {
  await db.settings.put({ key: KEY, value: profile });
}

export function hasGoal(p: Profile, goal: Goal): boolean {
  return p.goals.includes(goal);
}
