import type { EquipmentProfile } from '../model';

const LB = 0.45359237;
const lb = (pounds: number) => Math.round(pounds * LB * 10) / 10;

/**
 * Every assistance level an assisted machine offers: no assistance, each pin, and
 * (with an add-on lever) the lever alone and each pin plus the lever. kg, ascending.
 */
export function assistedLadderFrom(pinsKg: number[], leverKg: number | null): number[] {
  const r = (v: number) => Math.round(v * 10) / 10;
  const values = new Set<number>([0]);
  for (const p of pinsKg) {
    values.add(r(p));
    if (leverKg) values.add(r(p + leverKg));
  }
  if (leverKg) values.add(r(leverKg));
  return [...values].sort((a, b) => a - b);
}

/**
 * Default, derived from logged values and the "5 lb lever" answer: a 15 lb pin stack
 * (6.8, 13.6, 20.4, 27.2, 34.0 kg) with an optional +5 lb (2.3 kg) lever. Confirm in the gym.
 */
export const DEFAULT_ASSIST_PINS = [15, 30, 45, 60, 75].map(lb);
export const DEFAULT_ASSIST_LEVER = lb(5);

function assistedLadder(): number[] {
  return assistedLadderFrom(DEFAULT_ASSIST_PINS, DEFAULT_ASSIST_LEVER);
}

export const EQUIPMENT: EquipmentProfile[] = [
  {
    id: 'barbell-plates',
    name: 'Barbell plates',
    kind: 'step',
    stepKg: 2.5,
    note: 'Smallest jump 2.5 kg total (1.25 kg per side). Recorded as plates only.',
    quality: 'confirmed',
  },
  {
    id: 'leg-press-plates',
    name: 'Leg press plates',
    kind: 'step',
    stepKg: 5,
    note: 'Smallest jump assumed 5 kg total (2.5 kg per side). Recorded as plates only.',
    quality: 'unconfirmed',
  },
  {
    id: 'dumbbells',
    name: 'Dumbbells',
    kind: 'step',
    stepKg: 2.5,
    note: '2.5 kg steps (7.5, 10, 12.5, 15 …). Per hand.',
    quality: 'confirmed',
  },
  {
    id: 'cable-stack',
    name: 'Cable stack',
    kind: 'step',
    stepKg: null,
    note: 'kg stack; pin increments unknown ("next pin"). Logged values (15, 15.8, 39, 40 kg) suggest uneven pins.',
    quality: 'unknown',
  },
  {
    id: 'machine-stack',
    name: 'Selectorised machine',
    kind: 'step',
    stepKg: null,
    note: 'Pin increments unknown ("next pin").',
    quality: 'unknown',
  },
  {
    id: 'assisted-machine',
    name: 'Assisted pull-up/dip machine',
    kind: 'ladder',
    loadsKg: assistedLadder(),
    note: 'kg of assistance (less = harder). Derived 15 lb stack + 5 lb lever; confirm on the machine.',
    quality: 'inferred',
  },
];
