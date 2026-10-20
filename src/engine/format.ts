// Renders program values in the coach's notation ("4 × 6–8", "2–3 min", "–").

import type { Range, TemplateSlot } from './model';

const DASH = '–';

function span(min: number, max: number, unit = ''): string {
  return (min === max ? `${min}` : `${min}${DASH}${max}`) + unit;
}

export function formatSetsReps(slot: TemplateSlot): string {
  const t = slot.target;
  let base: string;
  switch (t.kind) {
    case 'reps':
      base = span(t.min, t.max);
      break;
    case 'max_time':
      base = 'max';
      break;
    case 'time':
      base = span(t.minSec, t.maxSec, ' s');
      break;
    case 'distance':
      base = span(t.minM, t.maxM, ' m');
      break;
    case 'duration':
      return span(t.minMin, t.maxMin, ' min');
  }
  let out = slot.sets === null ? base : `${slot.sets} × ${base}`;
  if (slot.perSide) out += ` / ${slot.perSide}`;
  if (slot.supersetGroup) out += ' each';
  return out;
}

export function formatRir(rir: Range | null): string {
  return rir ? span(rir.min, rir.max) : DASH;
}

export function formatRest(rest: Range | null): string {
  if (!rest) return DASH;
  if (rest.min >= 120 && rest.min % 60 === 0 && rest.max % 60 === 0) {
    return span(rest.min / 60, rest.max / 60, ' min');
  }
  return span(rest.min, rest.max, ' s');
}
