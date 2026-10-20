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
