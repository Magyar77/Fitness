import { describe, expect, it } from 'vitest';
import { buildExercise, buildWorkout, defaultSlot, kindOf, ruleFor, toDraft, traits, validateExercise, validateWorkout, type WorkoutDraft } from '../../src/engine/custom';
import { EXERCISES, EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import { formatSetsReps } from '../../src/engine/format';

const ex = (id: string) => EXERCISES_BY_ID.get(id)!;
let n = 0;
const ids = (code = 'X-test') => ({ id: code, code, newSlotKey: () => `${code}-${++n}` });

function draft(over: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    name: 'Arms extra',
    demand: 'moderate',
    notes: '',
    slots: [
      { ...defaultSlot(ex('barbell-curl')), targetKg: 20 },
      { ...defaultSlot(ex('cable-triceps-pushdown')), supersetWithPrevious: true },
      defaultSlot(ex('side-plank')),
    ],
    ...over,
  };
}

describe('library metadata', () => {
  it('gives every non-cardio exercise a region and marks loaded pulling', () => {
    expect(EXERCISES.filter((e) => e.measure !== 'duration' && !e.region).map((e) => e.id)).toEqual([]);
    expect(EXERCISES.filter((e) => e.pull).map((e) => e.id).sort()).toEqual(['assisted-negative-pull-up', 'assisted-pull-up', 'barbell-row', 'lat-pulldown', 'pull-up', 'seated-cable-row', 'single-arm-db-row']);
  });
});

describe('custom exercises', () => {
  const input = { name: '  Hammer curl ', kind: 'dumbbell' as const, region: 'upper' as const, pull: false, perSide: null, cues: 'Neutral grip\n\nNo swing' };

  it('validates names and regions', () => {
    expect(validateExercise({ ...input, name: '' }, EXERCISES)).toContain('Give the exercise a name.');
    expect(validateExercise({ ...input, name: 'lat pulldown' }, EXERCISES)).toContain('An exercise called "lat pulldown" already exists.');
    expect(validateExercise({ ...input, region: null }, EXERCISES)).toContain('Choose the main body region.');
    expect(validateExercise({ ...input, kind: 'cardio', region: null }, EXERCISES)).toEqual([]);
  });

  it('maps the chosen kind onto load type, measure and equipment', () => {
    const e = buildExercise(input, 'custom-1');
    expect(e).toMatchObject({ id: 'custom-1', name: 'Hammer curl', loadType: 'dumbbell_per_hand', measure: 'reps', equipmentProfileId: 'dumbbells', cues: ['Neutral grip', 'No swing'], custom: true, region: 'upper' });
    expect(kindOf(e)).toBe('dumbbell');
    expect(kindOf(buildExercise({ ...input, kind: 'assisted' }, 'c2'))).toBe('assisted');
    expect(buildExercise({ ...input, kind: 'cardio' }, 'c3')).toMatchObject({ measure: 'duration', region: null });
  });
});

describe('custom workouts', () => {
  it('validates the draft', () => {
    const exercises = EXERCISES_BY_ID;
    expect(validateWorkout(draft(), exercises, [])).toEqual([]);
    expect(validateWorkout(draft({ name: ' ', slots: [] }), exercises, [])).toEqual(['Give the workout a name.', 'Add at least one exercise.']);
    const bad = draft();
    bad.slots[0] = { ...bad.slots[0]!, min: 12, max: 8, sets: 0, rirMin: 3, rirMax: 1 };
    bad.slots[2] = { ...bad.slots[2]!, supersetWithPrevious: false, restMin: 60, restMax: null };
    expect(validateWorkout(bad, exercises, [])).toEqual([
      'Exercise 1 (Barbell or EZ-bar curls): sets must be 1–10.',
      'Exercise 1 (Barbell or EZ-bar curls): the reps range must go from low to high.',
      'Exercise 1 (Barbell or EZ-bar curls): RIR must be 0–5, low to high, or left empty.',
      'Exercise 3 (Side plank): rest must go from low to high, or be left empty.',
    ]);
    const taken = buildWorkout(draft(), exercises, ids('X-a'));
    expect(validateWorkout(draft({ name: 'ARMS EXTRA' }), exercises, [taken])).toEqual(['A workout called "ARMS EXTRA" already exists.']);
    expect(validateWorkout(draft({ name: 'ARMS EXTRA' }), exercises, [taken], 'X-a')).toEqual([]);
  });

  it('builds a workout the logger, progression and scheduler understand', () => {
    const t = buildWorkout(draft(), EXERCISES_BY_ID, ids('X-b'));
    expect(t).toMatchObject({ kind: 'custom', code: 'X-b', name: 'Arms extra', demand: 'moderate', regions: ['upper', 'core'], pullRole: 'none', pullVolume: false, easyDay: false });
    expect(t.slots.map((s) => [s.name, formatSetsReps(s), s.rule.id, s.supersetGroup ?? null])).toEqual([
      ['Barbell or EZ-bar curls', '3 × 8–12 each', 'load_double', 'X-b-ss1'],
      ['Cable triceps pushdown', '3 × 8–12 each', 'load_double', 'X-b-ss1'],
      ['Side plank', '3 × 20–40 s / side', 'timed_hold', null],
    ]);
    expect(t.slots.every((s) => s.slotKey.startsWith('X-b-'))).toBe(true);
  });

  it('derives pulling and grip load from the exercises', () => {
    expect(traits([defaultSlot(ex('lat-pulldown'))], EXERCISES_BY_ID)).toEqual({ regions: ['upper'], pullRole: 'none', pullVolume: true, gripLoad: true });
    expect(traits([defaultSlot(ex('dead-hang'))], EXERCISES_BY_ID)).toMatchObject({ pullRole: 'light', pullVolume: false, gripLoad: true });
  });

  it('chooses a progression rule from the exercise type', () => {
    expect(ruleFor(ex('assisted-dip'), { max: 10 })).toEqual({ id: 'assisted_reps' });
    expect(ruleFor(ex('dead-bug'), { max: 10 })).toEqual({ id: 'bodyweight_reps', capReps: 10 });
    expect(ruleFor(ex('farmers-carry'), { max: 40 })).toEqual({ id: 'distance_load' });
    expect(ruleFor(ex('cycling'), { max: 20 })).toEqual({ id: 'none' });
  });

  it('keeps slot keys when edited and round-trips through a draft', () => {
    const t = buildWorkout(draft(), EXERCISES_BY_ID, ids('X-c'));
    const d = toDraft(t, (s) => (s.exerciseId === 'barbell-curl' ? 20 : null));
    expect(d.slots.map((s) => s.supersetWithPrevious)).toEqual([false, true, false]);
    expect(d.slots[0]!.targetKg).toBe(20);
    // Reorder and remove one: the remaining keys survive, a new row gets a new key.
    const edited = { ...d, slots: [d.slots[2]!, d.slots[0]!, { ...defaultSlot(ex('dead-bug')) }] };
    edited.slots[1] = { ...edited.slots[1]!, supersetWithPrevious: false };
    const t2 = buildWorkout(edited, EXERCISES_BY_ID, ids('X-c'));
    expect(t2.slots[0]!.slotKey).toBe(t.slots[2]!.slotKey);
    expect(t2.slots[1]!.slotKey).toBe(t.slots[0]!.slotKey);
    expect(t.slots.map((s) => s.slotKey)).not.toContain(t2.slots[2]!.slotKey);
    expect(t2.slots.some((s) => s.supersetGroup)).toBe(false);
  });
});

describe('max holds in custom and program workouts', () => {
  it('round-trips a dead hang "2 × max" and progresses it as a max hang', () => {
    const d: WorkoutDraft = { name: 'Grip', demand: 'easy', notes: '', slots: [{ ...defaultSlot(ex('dead-hang')), sets: 2, maxEffort: true, min: 0, max: 0 }] };
    expect(validateWorkout(d, EXERCISES_BY_ID, [])).toEqual([]);
    const t = buildWorkout(d, EXERCISES_BY_ID, ids('X-max'));
    expect(t.slots[0]).toMatchObject({ target: { kind: 'max_time' }, rule: { id: 'max_hang' } });
    expect(formatSetsReps(t.slots[0]!)).toBe('2 × max');
    expect(toDraft(t, () => null).slots[0]).toMatchObject({ maxEffort: true, min: 20, max: 40 });
  });
});
