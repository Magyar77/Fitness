// Picking the next load from what the gym actually has.

import type { EquipmentProfile } from '../model';

/** Values closer than this are treated as the same pin (logs are rounded). */
const SAME_PIN_KG = 0.6;

const round = (kg: number) => Math.round(kg * 100) / 100;

/** Next heavier load, or null when the increment is unknown ("next pin"). */
export function heavier(profile: EquipmentProfile | undefined, current: number, stepKg?: number | null): number | null {
  if (profile?.kind === 'ladder') {
    return profile.loadsKg?.find((v) => v > current + SAME_PIN_KG) ?? null;
  }
  const step = stepKg ?? profile?.stepKg ?? null;
  return step ? round(current + step) : null;
}

/** Next lighter load (one step down), or null if unknown / none left. */
export function lighter(profile: EquipmentProfile | undefined, current: number, stepKg?: number | null): number | null {
  if (profile?.kind === 'ladder') {
    const below = profile.loadsKg?.filter((v) => v < current - SAME_PIN_KG) ?? [];
    return below.length ? below[below.length - 1]! : null;
  }
  const step = stepKg ?? profile?.stepKg ?? null;
  if (!step) return null;
  const next = round(current - step);
  return next >= 0 ? next : null;
}

/**
 * The heaviest available load at least `minPct` percent lighter (docx: "drop 5–10%").
 * Always at least one step lighter. null when increments are unknown.
 */
export function reduced(profile: EquipmentProfile | undefined, current: number, minPct: number, stepKg?: number | null): number | null {
  const goal = current * (1 - minPct / 100);
  if (profile?.kind === 'ladder') {
    const below = profile.loadsKg?.filter((v) => v <= goal + 1e-9 && v < current - SAME_PIN_KG) ?? [];
    return below.length ? below[below.length - 1]! : lighter(profile, current);
  }
  const step = stepKg ?? profile?.stepKg ?? null;
  if (!step) return null;
  const snapped = round(Math.floor(goal / step + 1e-9) * step);
  return Math.max(0, Math.min(snapped, round(current - step)));
}

export function sameLoad(a: number | null | undefined, b: number | null | undefined): boolean {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < SAME_PIN_KG;
}
