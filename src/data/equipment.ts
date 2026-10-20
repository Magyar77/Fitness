// Equipment as configured on this device: the built-in profiles with your overrides.

import { assistedLadderFrom, DEFAULT_ASSIST_LEVER, DEFAULT_ASSIST_PINS, EQUIPMENT } from '../engine/library/equipment';
import type { EquipmentProfile } from '../engine/model';
import type { FitnessDB } from './db';

export async function getEquipment(db: FitnessDB): Promise<EquipmentProfile[]> {
  const overrides = new Map((await db.equipment.toArray()).map((e) => [e.id, e]));
  return EQUIPMENT.map((e) => overrides.get(e.id) ?? e);
}

export interface EquipmentSettings {
  /** Assisted machine pin values (kg of assistance) and the add-on lever (kg, or null if none). */
  assistPins: number[];
  assistLever: number | null;
  barbellStep: number;
  legPressStep: number;
  dumbbellStep: number;
  /** null = unknown ("next pin"). */
  cableStep: number | null;
  machineStep: number | null;
}

export function settingsFrom(profiles: EquipmentProfile[]): EquipmentSettings {
  const get = (id: string) => profiles.find((p) => p.id === id)!;
  const assisted = get('assisted-machine');
  return {
    assistPins: assisted.pinsKg ?? DEFAULT_ASSIST_PINS,
    assistLever: assisted.leverKg !== undefined ? assisted.leverKg : DEFAULT_ASSIST_LEVER,
    barbellStep: get('barbell-plates').stepKg ?? 2.5,
    legPressStep: get('leg-press-plates').stepKg ?? 5,
    dumbbellStep: get('dumbbells').stepKg ?? 2.5,
    cableStep: get('cable-stack').stepKg ?? null,
    machineStep: get('machine-stack').stepKg ?? null,
  };
}

export function validateEquipment(s: EquipmentSettings): string[] {
  const problems: string[] = [];
  if (!s.assistPins.length) problems.push('Enter at least one assisted-machine pin value.');
  if (s.assistPins.some((p) => !(p > 0 && p < 150))) problems.push('Assisted-machine pins must be between 0 and 150 kg.');
  if (s.assistLever !== null && !(s.assistLever > 0 && s.assistLever < 20)) problems.push('The lever must add between 0 and 20 kg (leave it empty if there is none).');
  for (const [name, v] of [['Barbell', s.barbellStep], ['Leg press', s.legPressStep], ['Dumbbell', s.dumbbellStep]] as const) {
    if (!(v > 0 && v <= 20)) problems.push(`${name} step must be between 0 and 20 kg.`);
  }
  for (const [name, v] of [['Cable', s.cableStep], ['Machine', s.machineStep]] as const) {
    if (v !== null && !(v > 0 && v <= 20)) problems.push(`${name} step must be between 0 and 20 kg, or left empty if unknown.`);
  }
  return problems;
}

/** Stores your equipment as overrides; progression uses them from the next decision on. */
export async function saveEquipment(db: FitnessDB, s: EquipmentSettings): Promise<string[]> {
  const problems = validateEquipment(s);
  if (problems.length) return problems;
  const base = new Map(EQUIPMENT.map((e) => [e.id, e]));
  const pins = [...new Set(s.assistPins.map((p) => Math.round(p * 10) / 10))].sort((a, b) => a - b);
  const step = (id: string, stepKg: number | null, unknownNote: string): EquipmentProfile => ({
    ...base.get(id)!,
    stepKg,
    note: stepKg === null ? unknownNote : `Steps of ${stepKg} kg (set by you).`,
    quality: stepKg === null ? 'unknown' : 'confirmed',
  });
  const profiles: EquipmentProfile[] = [
    step('barbell-plates', s.barbellStep, ''),
    step('leg-press-plates', s.legPressStep, ''),
    step('dumbbells', s.dumbbellStep, ''),
    step('cable-stack', s.cableStep, 'Pin step unknown ("next pin").'),
    step('machine-stack', s.machineStep, 'Pin step unknown ("next pin").'),
    {
      ...base.get('assisted-machine')!,
      loadsKg: assistedLadderFrom(pins, s.assistLever),
      pinsKg: pins,
      leverKg: s.assistLever,
      note: `Pins ${pins.join(', ')} kg${s.assistLever ? `, lever +${s.assistLever} kg` : ', no lever'} (set by you). Less is harder.`,
      quality: 'confirmed',
    },
  ];
  await db.equipment.bulkPut(profiles);
  return [];
}

// ---------------------------------------------------------------------------
// Unit defaults

const CUSTOMIZED_KEY = 'equipmentCustomized';

/** Remember that the person set their own steps, so a unit switch never overwrites them. */
export async function markEquipmentCustomized(db: FitnessDB): Promise<void> {
  await db.settings.put({ key: CUSTOMIZED_KEY, value: true });
}

/**
 * Standard increments for a unit: kg uses the built-in profiles; lb uses 5 lb plates and
 * dumbbells and 10 lb on the leg press. Skipped when the person has set their own steps.
 */
export async function applyUnitDefaults(db: FitnessDB, unit: 'kg' | 'lb'): Promise<boolean> {
  if ((await db.settings.get(CUSTOMIZED_KEY))?.value === true) return false;
  if (unit === 'kg') {
    await db.equipment.clear();
    return true;
  }
  const lb = (v: number) => Math.round((v / 2.20462262185) * 10000) / 10000;
  const current = settingsFrom(await getEquipment(db));
  await db.equipment.clear();
  const problems = await saveEquipment(db, { ...current, barbellStep: lb(5), legPressStep: lb(10), dumbbellStep: lb(5) });
  if (problems.length) throw new Error(problems.join(' '));
  return true;
}
