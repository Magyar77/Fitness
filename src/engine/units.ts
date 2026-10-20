// Weight units. Everything is stored in kg; this layer converts for display and entry.

export type Unit = 'kg' | 'lb';

export const LB_PER_KG = 2.20462262185;

/** kg → the number shown in `unit` (kg to 0.01, lb to 0.1). */
export function toDisplay(kg: number, unit: Unit): number {
  return unit === 'kg' ? Math.round(kg * 100) / 100 : Math.round(kg * LB_PER_KG * 10) / 10;
}

/** A number typed in `unit` → kg (kept precise, so 45 lb shows as 45 lb again). */
export function fromDisplay(value: number, unit: Unit): number {
  return unit === 'kg' ? value : Math.round((value / LB_PER_KG) * 10000) / 10000;
}

/** "42.5 kg" / "95 lb". */
export function formatLoad(kg: number, unit: Unit): string {
  return `${toDisplay(kg, unit)} ${unit}`;
}

/** One unit step in kg, e.g. a 5 lb plate step. */
export function stepInKg(step: number, unit: Unit): number {
  return fromDisplay(step, unit);
}

// ---------------------------------------------------------------------------
// Barbell convention. Barbell loads are stored as plates only (bar not counted); people
// who count the bar see and type the total, with the bar added or subtracted here.

/** Plates on a barbell, recorded without the bar (not the leg press sled or an EZ bar recorded as a total). */
export function isPlatesBarbell(e: { loadType: string; equipmentProfileId?: string }): boolean {
  return e.loadType === 'plates' && e.equipmentProfileId === 'barbell-plates';
}

/** kg to add when showing this exercise's load (0 when plates only or not a barbell). */
export function barOffset(e: { loadType: string; equipmentProfileId?: string }, barKg: number | null): number {
  return barKg && isPlatesBarbell(e) ? barKg : 0;
}

/** Stored plates → what the person sees. */
export function shownLoad(storedKg: number, e: { loadType: string; equipmentProfileId?: string }, barKg: number | null, unit: Unit): number {
  return toDisplay(storedKg + barOffset(e, barKg), unit);
}

/** What the person typed → stored plates (never below an empty bar). */
export function storedLoad(typed: number, e: { loadType: string; equipmentProfileId?: string }, barKg: number | null, unit: Unit): number {
  return Math.max(0, Math.round((fromDisplay(typed, unit) - barOffset(e, barKg)) * 10000) / 10000);
}

export const STANDARD_BAR_KG = 20;
export const STANDARD_BAR_LB_IN_KG = 20.4117; // 45 lb
