// Body measurements: stored in cm (body fat in %), shown in cm or inches. One entry per
// day; saving the same day again adds to it.

import type { IsoDate } from './dates';
import type { Unit } from './units';

export type MeasureKey = 'waist' | 'hips' | 'chest' | 'neck' | 'arm' | 'thigh' | 'calf' | 'bodyFat';

export interface MeasurementEntry {
  date: IsoDate;
  /** cm, except bodyFat in %. */
  values: Partial<Record<MeasureKey, number>>;
  notes?: string;
}

export const MEASURES: { key: MeasureKey; label: string; how: string }[] = [
  { key: 'waist', label: 'Waist', how: 'At the navel, standing relaxed, after breathing out.' },
  { key: 'hips', label: 'Hips', how: 'Around the widest part of the buttocks, feet together.' },
  { key: 'chest', label: 'Chest', how: 'Under the armpits, across the nipples, arms down.' },
  { key: 'neck', label: 'Neck', how: 'Just below the Adam’s apple.' },
  { key: 'arm', label: 'Upper arm', how: 'Widest part, arm hanging relaxed; same arm every time.' },
  { key: 'thigh', label: 'Thigh', how: 'Widest part, standing, weight on both feet; same leg every time.' },
  { key: 'calf', label: 'Calf', how: 'Widest part, standing.' },
  { key: 'bodyFat', label: 'Body fat', how: 'From a scale or calliper, if you have one; the same device every time.' },
];

export const CM_PER_IN = 2.54;

/** Length unit that goes with the weight unit: kg → cm, lb → in. */
export const lengthUnit = (unit: Unit): 'cm' | 'in' => (unit === 'kg' ? 'cm' : 'in');

export function measureUnit(key: MeasureKey, unit: Unit): string {
  return key === 'bodyFat' ? '%' : lengthUnit(unit);
}

/** Stored value → shown value (cm or in to 0.1; % to 0.1). */
export function toShown(key: MeasureKey, value: number, unit: Unit): number {
  const v = key === 'bodyFat' || unit === 'kg' ? value : value / CM_PER_IN;
  return Math.round(v * 10) / 10;
}

/** Typed value → stored value. */
export function fromShown(key: MeasureKey, value: number, unit: Unit): number {
  return key === 'bodyFat' || unit === 'kg' ? value : Math.round(value * CM_PER_IN * 100) / 100;
}

export function formatMeasure(key: MeasureKey, value: number, unit: Unit): string {
  const u = measureUnit(key, unit);
  return `${toShown(key, value, unit)}${u === '%' ? '%' : ` ${u}`}`;
}

const RANGE: Record<MeasureKey, [number, number]> = {
  waist: [40, 250], hips: [50, 250], chest: [50, 250], neck: [20, 80], arm: [15, 80], thigh: [25, 120], calf: [20, 80], bodyFat: [2, 70],
};

export function validateMeasurement(e: MeasurementEntry, today: IsoDate): string[] {
  const problems: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) problems.push('Choose a date.');
  else if (e.date > today) problems.push("The date can't be in the future.");
  const filled = Object.entries(e.values).filter(([, v]) => typeof v === 'number');
  if (!filled.length) problems.push('Enter at least one measurement.');
  for (const [k, v] of filled as [MeasureKey, number][]) {
    const [lo, hi] = RANGE[k];
    if (!(v >= lo && v <= hi)) problems.push(`${MEASURES.find((m) => m.key === k)!.label} looks off: check the number and unit.`);
  }
  return problems;
}

/** Adds the new values to whatever was already entered that day. */
export function mergeMeasurement(existing: MeasurementEntry | undefined, next: MeasurementEntry): MeasurementEntry {
  const values = { ...(existing?.values ?? {}), ...Object.fromEntries(Object.entries(next.values).filter(([, v]) => typeof v === 'number')) };
  const notes = next.notes?.trim() || existing?.notes;
  return { date: next.date, values, ...(notes ? { notes } : {}) };
}

export interface MeasurePoint {
  date: IsoDate;
  value: number;
}

/** One measurement over time, oldest first. */
export function measureSeries(entries: MeasurementEntry[], key: MeasureKey): MeasurePoint[] {
  return entries
    .filter((e) => typeof e.values[key] === 'number')
    .map((e) => ({ date: e.date, value: e.values[key]! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Latest value and the change since the first entry. */
export function measureChange(entries: MeasurementEntry[], key: MeasureKey): { latest: MeasurePoint; first: MeasurePoint; change: number } | null {
  const s = measureSeries(entries, key);
  if (!s.length) return null;
  const latest = s.at(-1)!;
  const first = s[0]!;
  return { latest, first, change: Math.round((latest.value - first.value) * 100) / 100 };
}

/** Measurements that have any data, in the standard order. */
export function measuredKeys(entries: MeasurementEntry[]): MeasureKey[] {
  return MEASURES.map((m) => m.key).filter((k) => entries.some((e) => typeof e.values[k] === 'number'));
}
