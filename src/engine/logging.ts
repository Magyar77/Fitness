// Pure helpers for the workout logger: what to pre-fill, and how to summarise sets.

import type { Exercise, Prescription, SetLog, Side, TemplateSlot } from './model';
import { formatRest, formatRir, formatSetsReps } from './format';
import type { SlotPerformance } from './progression/types';
import { formatLoad, type Unit } from './units';

export interface PlannedSet {
  side: Side;
  weightKg?: number | null;
  assistKg?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  distanceM?: number | null;
}

/** "4 × 6–8 · RIR 2 · rest 2–3 min" */
export function slotSummary(slot: TemplateSlot): string {
  const parts = [formatSetsReps(slot)];
  if (slot.rir) parts.push(`RIR ${formatRir(slot.rir)}`);
  if (slot.restSec) parts.push(`rest ${formatRest(slot.restSec)}`);
  return parts.join(' · ');
}

/** What this slot asks for today: the active target's text, or the program prescription. */
export function targetText(slot: TemplateSlot, rx: Prescription | null): string {
  return rx?.text ?? slotSummary(slot);
}

function lastValue(perf: SlotPerformance | null, key: 'weightKg' | 'assistKg'): number | null {
  if (!perf) return null;
  for (let i = perf.sets.length - 1; i >= 0; i--) {
    const v = perf.sets[i]![key];
    if (typeof v === 'number') return v;
  }
  return null;
}

const usesWeight = (e: Exercise) => ['plates', 'barbell_total', 'dumbbell_per_hand', 'machine', 'cable'].includes(e.loadType);

/**
 * Values to pre-fill for each prescribed set: the current target first, then what was
 * used last time (e.g. when the target is "next pin" with no number yet).
 */
export function planSets(slot: TemplateSlot, exercise: Exercise, rx: Prescription | null, last: SlotPerformance | null): PlannedSet[] {
  const count = slot.sets ?? 1;
  const side: Side = slot.perSide ? 'each' : 'both';
  const t = slot.target;
  return Array.from({ length: count }, (_, i) => {
    const p: PlannedSet = { side };
    if (exercise.loadType === 'assisted_machine') p.assistKg = rx?.assistKg ?? lastValue(last, 'assistKg');
    else if (usesWeight(exercise)) p.weightKg = rx?.loadKg ?? lastValue(last, 'weightKg');
    switch (t.kind) {
      case 'reps':
        p.reps = rx?.repTargets?.[i] ?? rx?.repTargets?.[0] ?? t.min;
        break;
      case 'time':
        p.durationSec = rx?.timeSec ?? t.minSec;
        break;
      case 'max_time':
        p.durationSec = null; // a max hold: enter what you held
        break;
      case 'distance':
        p.distanceM = rx?.distanceM ?? t.maxM;
        break;
      case 'duration':
        p.durationSec = t.minMin * 60;
        break;
    }
    return p;
  });
}


function rirSummary(sets: SetLog[]): string {
  const values = sets.map((s) => s.rir).filter((r): r is NonNullable<typeof r> => !!r);
  if (!values.length) return '';
  const text = values.map((r) => (r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`));
  return new Set(text).size === 1 ? ` · RIR ${text[0]}` : ` · RIR ${text[0]}→${text[text.length - 1]}`;
}

/** Compact one-line summary, e.g. "20 kg × 8/8/8/8 · RIR 2" or "45 s, 35 s". */
export function summarizeSets(sets: SetLog[], exercise: Exercise, weightUnit: Unit = 'kg'): string {
  const kg = (v: number) => formatLoad(v, weightUnit);
  const done = sets.filter((s) => s.completed && !s.isWarmup);
  if (!done.length) return 'nothing logged';
  const n = (v: number | null | undefined) => (v === null || v === undefined ? '?' : `${v}`);

  if (exercise.measure === 'time' || exercise.measure === 'duration') {
    const secs = done.map((s) => s.durationSec);
    if (exercise.measure === 'duration') return secs.map((x) => (x == null ? '?' : `${Math.round(x / 60)} min`)).join(', ');
    return secs.map((x) => `${n(x)} s`).join(', ');
  }

  const loadKey = exercise.loadType === 'assisted_machine' ? 'assistKg' : 'weightKg';
  const suffix = loadKey === 'assistKg' ? ' assist' : '';
  const value = (s: SetLog) => (exercise.measure === 'distance' ? `${n(s.distanceM)}` : `${n(s.reps)}${s.drops?.length ? `+${s.drops.map((d) => d.reps).join('+')}` : ''}`);
  const unit = exercise.measure === 'distance' ? ' m' : '';
  const loads = done.map((s) => s[loadKey]);
  const hasLoad = loads.some((l) => typeof l === 'number');
  let body: string;
  if (!hasLoad) body = done.map(value).join('/') + unit;
  else if (new Set(loads).size === 1) body = `${kg(loads[0] as number)}${suffix} × ${done.map(value).join('/')}${unit}`;
  else body = done.map((s) => `${typeof s[loadKey] === 'number' ? kg(s[loadKey] as number) : '?'}${suffix} × ${value(s)}${unit}`).join(', ');
  return body + rirSummary(done);
}
