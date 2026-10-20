import { describe, expect, it } from 'vitest';
import { buildFromOptions, jobsForParts, similarExercises, swapSlot, toWorkoutDraft, type BuildOptions } from '../../src/engine/library/builder';
import { bodyPartsOf } from '../../src/engine/library/groups';
import { EXERCISES, EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import { validateWorkout } from '../../src/engine/custom';

const opts = (p: Partial<BuildOptions> = {}): BuildOptions => ({ focus: 'upper', setup: 'gym', minutes: 45, level: 'intermediate', ...p });
const names = (o: BuildOptions) => buildFromOptions(EXERCISES, o).slots.map((s) => s.exercise.name);

describe('workout builder', () => {
  it('builds an upper-body gym workout, compound lifts first, from the hand-checked exercises', () => {
    const b = buildFromOptions(EXERCISES, opts());
    expect(b.slots.map((s) => s.job.id)).toEqual(['hpush', 'vpull', 'vpush', 'hpull', 'delts', 'biceps']);
    expect(b.slots.every((s) => (s.exercise.region ?? 'upper') !== 'lower')).toBe(true);
    expect(b.slots.slice(0, 4).every((s) => !s.exercise.id.startsWith('fx-'))).toBe(true);
    expect(b.name).toBe('Upper body (45 min)');
    expect(b.skipped).toEqual([]);
  });

  it('never repeats an exercise and is the same every time', () => {
    for (const focus of ['full', 'upper', 'lower', 'push', 'pull', 'arms', 'core'] as const) {
      for (const setup of ['gym', 'dumbbells', 'bodyweight', 'bands'] as const) {
        const ids = buildFromOptions(EXERCISES, opts({ focus, setup, minutes: 60 })).slots.map((s) => s.exercise.id);
        expect(new Set(ids).size, `${focus}/${setup}`).toBe(ids.length);
        expect(buildFromOptions(EXERCISES, opts({ focus, setup, minutes: 60 })).slots.map((s) => s.exercise.id)).toEqual(ids);
      }
    }
  });

  it('only uses equipment you have', () => {
    const street = buildFromOptions(EXERCISES, opts({ focus: 'full', setup: 'bodyweight', minutes: 60 }));
    expect(street.slots.every((s) => s.exercise.equipmentKind === 'bodyweight')).toBe(true);
    expect(street.slots.length).toBeGreaterThanOrEqual(7);
    expect(street.name).toBe('Full body · street (60 min)');
    const db = buildFromOptions(EXERCISES, opts({ focus: 'lower', setup: 'dumbbells' }));
    expect(db.slots.every((s) => ['dumbbell', 'kettlebell', 'bodyweight'].includes(s.exercise.equipmentKind!))).toBe(true);
  });

  it('time and level change the size and difficulty', () => {
    expect(names(opts({ minutes: 30 }))).toHaveLength(4);
    expect(names(opts({ minutes: 60 }))).toHaveLength(8);
    expect(names(opts({ minutes: 30, level: 'beginner' }))).toHaveLength(3);
    const beginner = buildFromOptions(EXERCISES, opts({ focus: 'full', setup: 'bodyweight', level: 'beginner', minutes: 60 }));
    expect(beginner.slots.every((s) => s.exercise.level !== 'expert' && s.exercise.level !== 'intermediate')).toBe(true);
    const expert = buildFromOptions(EXERCISES, opts({ level: 'expert' })).slots[0]!.draft;
    expect(expert).toMatchObject({ sets: 4, min: 5, max: 8 });
  });

  it('chosen body parts are interleaved, compound first', () => {
    expect(jobsForParts(['chest', 'back']).slice(0, 4).map((j) => j.id)).toEqual(['hpush', 'vpull', 'hpush', 'hpull']);
    const b = buildFromOptions(EXERCISES, opts({ focus: 'parts', parts: ['chest', 'arms'] }));
    expect(b.name).toBe('Chest + Arms (45 min)');
    expect(b.slots.every((s) => bodyPartsOf(s.exercise).some((p) => p === 'chest' || p === 'arms'))).toBe(true);
  });

  it('swap gives another exercise for the same job; variants differ', () => {
    const o = opts();
    const b = buildFromOptions(EXERCISES, o);
    const swapped = swapSlot(EXERCISES, b, 0, o);
    expect(swapped.slots[0]!.exercise.id).not.toBe(b.slots[0]!.exercise.id);
    expect(swapped.slots[0]!.exercise.pattern).toBe('horizontal-push');
    expect(swapped.slots.slice(1)).toEqual(b.slots.slice(1));
    expect(names(opts({ variant: 1 }))).not.toEqual(names(o));
  });

  it('produces a valid workout draft', () => {
    for (const focus of ['full', 'upper', 'lower', 'core'] as const) {
      const d = toWorkoutDraft(buildFromOptions(EXERCISES, opts({ focus })));
      expect(validateWorkout(d, EXERCISES_BY_ID, [])).toEqual([]);
    }
  });

  it('suggests stand-ins for a swap: same movement, mixing close variants and other equipment', () => {
    const bench = similarExercises(EXERCISES_BY_ID.get('barbell-bench-press')!, EXERCISES, 6);
    expect(bench.every((e) => e.pattern === 'horizontal-push' && e.id !== 'barbell-bench-press')).toBe(true);
    expect(bench.map((e) => e.id)).toContain('db-bench-press');
    const pulldown = similarExercises(EXERCISES_BY_ID.get('lat-pulldown')!, EXERCISES, 6).map((e) => e.id);
    expect(pulldown).toContain('pull-up');
    const plank = similarExercises(EXERCISES_BY_ID.get('plank')!, EXERCISES, 4);
    expect(plank.slice(0, 3).every((e) => e.measure === 'time')).toBe(true); // timed holds first
  });
});
