import { describe, expect, it } from 'vitest';
import { planSets, slotSummary, summarizeSets, targetText } from '../../src/engine/logging';
import { logSets, times } from '../../src/engine/import/compact';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import { EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import type { Prescription } from '../../src/engine/model';
import type { SlotPerformance } from '../../src/engine/progression';

const slots = PROGRAM_V2.templates.flatMap((t) => t.slots);
const slot = (k: string) => slots.find((s) => s.slotKey === k)!;
const ex = (k: string) => EXERCISES_BY_ID.get(slot(k).exerciseId)!;
const rx = (p: Partial<Prescription>): Prescription => ({ id: 'r', effectiveFrom: '2026-01-01', text: 'target', status: 'active', quality: 'confirmed', source: 'engine', sourceRef: 't', ...p });
const perf = (key: string, rows: Parameters<typeof logSets>[3]): SlotPerformance => ({
  session: { id: 'p', date: '2026-01-01', templateCode: key[0]!, programVersionId: PROGRAM_V2.id, status: 'completed', startedAt: null, finishedAt: null, fatigue: null, discomfort: [], conditions: [], notes: [], flags: [], prescriptionSnapshot: null },
  sets: logSets('p', key, slot(key).exerciseId, rows),
});

describe('slot summary and target text', () => {
  it('describes the program prescription', () => {
    expect(slotSummary(slot('A-03'))).toBe('4 × 6–8 · RIR 2 · rest 2–3 min');
    expect(slotSummary(slot('E-06'))).toBe('2 × 30 s / side · rest 45 s');
    expect(slotSummary(slot('E-07'))).toBe('15–20 min');
  });
  it('prefers the active target', () => {
    expect(targetText(slot('A-03'), rx({ text: '42.5 kg, 4 × 6–8' }))).toBe('42.5 kg, 4 × 6–8');
    expect(targetText(slot('A-03'), null)).toBe('4 × 6–8 · RIR 2 · rest 2–3 min');
  });
});

describe('planSets (pre-filled rows)', () => {
  it('uses the target load and per-set rep targets', () => {
    expect(planSets(slot('A-03'), ex('A-03'), rx({ loadKg: 42.5, repTargets: [7, 7, 6, 6] }), null)).toEqual([
      { side: 'both', weightKg: 42.5, reps: 7 },
      { side: 'both', weightKg: 42.5, reps: 7 },
      { side: 'both', weightKg: 42.5, reps: 6 },
      { side: 'both', weightKg: 42.5, reps: 6 },
    ]);
  });
  it('falls back to last time\'s load when the target has no number ("next pin")', () => {
    const last = perf('C-06', times(2, { w: 20, r: 15 }));
    expect(planSets(slot('C-06'), ex('C-06'), rx({ loadKg: null, repTargets: [12, 12] }), last)[0]).toEqual({ side: 'both', weightKg: 20, reps: 12 });
  });
  it('handles assisted, unilateral, timed, max holds, distance and cardio', () => {
    expect(planSets(slot('C-03'), ex('C-03'), rx({ assistKg: 29.5, repTargets: [6, 6, 6] }), null)[0]).toEqual({ side: 'both', assistKg: 29.5, reps: 6 });
    expect(planSets(slot('B-03'), ex('B-03'), null, null)[0]).toEqual({ side: 'each', weightKg: null, reps: 8 });
    expect(planSets(slot('B-06'), ex('B-06'), rx({ timeSec: 35 }), null)[0]).toEqual({ side: 'both', durationSec: 35 });
    expect(planSets(slot('A-01'), ex('A-01'), rx({ timeSec: 45 }), null)[0]).toEqual({ side: 'both', durationSec: null });
    expect(planSets(slot('D-07'), ex('D-07'), rx({ loadKg: 22.5, distanceM: 40 }), null)).toHaveLength(3);
    expect(planSets(slot('D-07'), ex('D-07'), rx({ loadKg: 22.5, distanceM: 40 }), null)[0]).toEqual({ side: 'both', weightKg: 22.5, distanceM: 40 });
    expect(planSets(slot('E-07'), ex('E-07'), null, null)).toEqual([{ side: 'both', durationSec: 900 }]);
  });
});

describe('summarizeSets ("last time")', () => {
  const sum = (key: string, rows: Parameters<typeof logSets>[3]) => summarizeSets(perf(key, rows).sets, ex(key));
  it('summarises same-load sets compactly with RIR', () => {
    expect(sum('A-03', times(4, { w: 20, r: 8, rir: 2 }))).toBe('20 kg × 8/8/8/8 · RIR 2');
    expect(sum('A-04', [{ w: 12.5, r: 9, rir: 1 }, { w: 12.5, r: 9, rir: [0, 1] }, { w: 12.5, r: 9, rir: 0 }])).toBe('12.5 kg × 9/9/9 · RIR 1→0');
  });
  it('lists mixed loads per set and shows drop reps', () => {
    expect(sum('A-07', [{ w: 12.5, r: 12 }, { w: 15, r: 10, rir: 2 }, { w: 15, r: 5, drops: [{ weightKg: 12.5, reps: 7 }] }])).toBe('12.5 kg × 12, 15 kg × 10, 15 kg × 5+7 · RIR 2');
  });
  it('summarises assisted, timed, distance, bodyweight and cardio', () => {
    expect(sum('C-03', times(3, { a: 34, r: 8, rir: 0 }))).toBe('34 kg assist × 8/8/8 · RIR 0');
    expect(sum('A-01', [{ t: 45 }, { t: 35 }])).toBe('45 s, 35 s');
    expect(sum('D-07', times(3, { w: 20, d: 50 }))).toBe('20 kg × 50/50/50 m');
    expect(sum('E-05', times(3, { r: 7 }))).toBe('7/7/7');
    expect(sum('E-07', [{ t: 900 }])).toBe('15 min');
  });
  it('ignores sets not marked completed', () => {
    const p = perf('A-03', times(2, { w: 20, r: 8 }));
    p.sets[1]!.completed = false;
    expect(summarizeSets(p.sets, ex('A-03'))).toBe('20 kg × 8');
    p.sets[0]!.completed = false;
    expect(summarizeSets(p.sets, ex('A-03'))).toBe('nothing logged');
  });
});
