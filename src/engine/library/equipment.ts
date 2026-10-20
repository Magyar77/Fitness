import type { EquipmentProfile } from '../model';

const LB = 0.45359237;
const lb = (pounds: number) => Math.round(pounds * LB * 10) / 10;

/**
 * Assisted machine (pull-ups, dips, negatives): kg of assistance.
 * Derived from logged values and the "5 lb lever" answer: a 15 lb pin stack
 * (6.8, 13.6, 20.4, 27.2, 34.0 kg) with an optional +5 lb (2.3 kg) lever.
 */
function assistedLadder(): number[] {
  const pins = [0, 15, 30, 45, 60, 75];
  const values = new Set<number>();
  for (const p of pins) {
    values.add(lb(p));
    if (p > 0) values.add(lb(p + 5)); // pin + lever
  }
  values.add(lb(5)); // lever only
  return [...values].sort((a, b) => a - b);
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
