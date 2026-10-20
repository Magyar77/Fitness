import { describe, expect, it } from 'vitest';
import { formatLoad, fromDisplay, stepInKg, toDisplay } from '../../src/engine/units';
import { evaluateSlot, DEFAULT_SETTINGS, heavier } from '../../src/engine/progression';
import { summarizeSets } from '../../src/engine/logging';
import { exerciseHistory, exerciseSeries } from '../../src/engine/stats';
import { logSets, times } from '../../src/engine/import/compact';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import { EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import type { EquipmentProfile, WorkoutSession } from '../../src/engine/model';

const session = (id: string, date: string): WorkoutSession => ({
  id, date, templateCode: 'A', programVersionId: PROGRAM_V2.id, status: 'completed', startedAt: null, finishedAt: null,
  fatigue: null, discomfort: [], conditions: [], notes: [], flags: [], prescriptionSnapshot: null,
});

describe('unit conversion', () => {
  it('round-trips typed pounds exactly and shows kg to 0.01', () => {
    expect(toDisplay(fromDisplay(45, 'lb'), 'lb')).toBe(45);
    expect(toDisplay(fromDisplay(135, 'lb'), 'lb')).toBe(135);
    expect(toDisplay(fromDisplay(17.5, 'lb'), 'lb')).toBe(17.5);
    expect(toDisplay(20.4117, 'kg')).toBe(20.41);
    expect(fromDisplay(42.5, 'kg')).toBe(42.5);
    expect(formatLoad(20, 'lb')).toBe('44.1 lb');
    expect(formatLoad(42.5, 'kg')).toBe('42.5 kg');
  });

  it('keeps 5 lb plate steps on whole pounds after many increases', () => {
    const plates: EquipmentProfile = { id: 'p', name: 'plates', kind: 'step', stepKg: stepInKg(5, 'lb'), note: '', quality: 'confirmed' };
    let load = fromDisplay(95, 'lb');
    for (let i = 0; i < 20; i++) load = heavier(plates, load)!;
    expect(toDisplay(load, 'lb')).toBe(195);
  });
});

describe('engine output in pounds', () => {
  const slot = PROGRAM_V2.templates[0]!.slots.find((s) => s.slotKey === 'A-03')!;
  const lbPlates: EquipmentProfile = { id: 'barbell-plates', name: 'plates', kind: 'step', stepKg: stepInKg(5, 'lb'), note: '', quality: 'confirmed' };

  it('explains a progression and writes the next target in lb', () => {
    const s1 = session('s1', '2026-03-03');
    const d = evaluateSlot({
      slot: { ...slot, rule: { id: 'load_double' } },
      template: PROGRAM_V2.templates[0]!,
      exercise: EXERCISES_BY_ID.get('barbell-bench-press')!,
      equipment: lbPlates,
      current: null,
      history: [{ session: s1, sets: logSets('s1', 'A-03', 'barbell-bench-press', times(4, { w: fromDisplay(95, 'lb'), r: 8, rir: 2 })) }],
      settings: { ...DEFAULT_SETTINGS, unit: 'lb' },
    });
    expect(d.explanation).toContain('the weight goes up to 100 lb');
    expect(d.next?.text).toBe('100 lb, 4 × 6–8');
    expect(toDisplay(d.next!.loadKg!, 'lb')).toBe(100);
  });

  it('summarises and charts in lb', () => {
    const sets = logSets('s1', 'A-03', 'barbell-bench-press', times(2, { w: fromDisplay(135, 'lb'), r: 5 }));
    const ex = EXERCISES_BY_ID.get('barbell-bench-press')!;
    expect(summarizeSets(sets, ex, 'lb')).toBe('135 lb × 5/5');
    const series = exerciseSeries(exerciseHistory([session('s1', '2026-03-03')], sets, ex, 'lb'), ex, 'lb');
    expect(series).toMatchObject({ unit: 'lb', points: [{ value: 135, label: '135 lb × 5/5' }] });
  });
});

describe('program steps on pound equipment', () => {
  const lbPlates: EquipmentProfile = { id: 'barbell-plates', name: 'plates', kind: 'step', stepKg: stepInKg(5, 'lb'), note: '', quality: 'confirmed' };
  const run = (key: string, lb: number, reps: number) => {
    const t = PROGRAM_V2.templates.find((x) => x.slots.some((s) => s.slotKey === key))!;
    const slot = t.slots.find((s) => s.slotKey === key)!;
    const exercise = EXERCISES_BY_ID.get(slot.exerciseId)!;
    return evaluateSlot({
      slot, template: t, exercise, equipment: lbPlates, current: null,
      history: [{ session: session('s1', '2026-03-03'), sets: logSets('s1', key, slot.exerciseId, times(slot.sets!, { w: fromDisplay(lb, 'lb'), r: reps, rir: 2 })) }],
      settings: { ...DEFAULT_SETTINGS, unit: 'lb' },
    });
  };
  it('turns +2.5 kg into +5 lb and +5 kg into +10 lb', () => {
    expect(run('A-03', 95, 8).next?.text).toBe('100 lb, 4 × 6–8'); // bench: +2.5 kg rule
    expect(run('B-01', 135, 8).next?.text).toBe('145 lb, 3 × 6–8'); // squat: +5 kg rule
  });
});
