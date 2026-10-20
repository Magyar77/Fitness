// Custom exercises and workouts: from form drafts to the same shapes the program uses,
// so the logger, progression and scheduler treat them like any other workout.

import type { Demand, Exercise, LoadType, Measure, ProgressionRule, Range, Region, SlotTarget, TemplateSlot, WorkoutTemplate } from './model';

// ---------------------------------------------------------------------------
// Custom exercises

export type ExerciseKind = 'barbell' | 'barbell_total' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'assisted' | 'timed' | 'distance' | 'cardio';

export const EXERCISE_KINDS: { kind: ExerciseKind; label: string }[] = [
  { kind: 'barbell', label: 'Barbell (record plates only)' },
  { kind: 'barbell_total', label: 'Barbell / EZ bar (record total weight)' },
  { kind: 'dumbbell', label: 'Dumbbells (per hand)' },
  { kind: 'machine', label: 'Machine (stack)' },
  { kind: 'cable', label: 'Cable' },
  { kind: 'bodyweight', label: 'Bodyweight reps' },
  { kind: 'assisted', label: 'Assisted machine (kg of help)' },
  { kind: 'timed', label: 'Timed hold (seconds)' },
  { kind: 'distance', label: 'Loaded carry (metres)' },
  { kind: 'cardio', label: 'Cardio (minutes)' },
];

const KIND: Record<ExerciseKind, { loadType: LoadType; measure: Measure }> = {
  barbell: { loadType: 'plates', measure: 'reps' },
  barbell_total: { loadType: 'barbell_total', measure: 'reps' },
  dumbbell: { loadType: 'dumbbell_per_hand', measure: 'reps' },
  machine: { loadType: 'machine', measure: 'reps' },
  cable: { loadType: 'cable', measure: 'reps' },
  bodyweight: { loadType: 'bodyweight', measure: 'reps' },
  assisted: { loadType: 'assisted_machine', measure: 'reps' },
  timed: { loadType: 'bodyweight', measure: 'time' },
  distance: { loadType: 'dumbbell_per_hand', measure: 'distance' },
  cardio: { loadType: 'cardio', measure: 'duration' },
};

const CONVENTION: Record<LoadType, string> = {
  plates: 'Plates only, bar/sled not counted.',
  barbell_total: 'Total weight including the bar.',
  dumbbell_per_hand: 'Weight per hand.',
  machine: 'Weight on the stack.',
  cable: 'Weight on the stack.',
  bodyweight: 'Bodyweight.',
  assisted_machine: 'kg of assistance; less is harder.',
  cardio: 'Duration only.',
};

const PROFILE: Partial<Record<LoadType, string>> = {
  plates: 'barbell-plates',
  barbell_total: 'barbell-plates',
  dumbbell_per_hand: 'dumbbells',
  machine: 'machine-stack',
  cable: 'cable-stack',
  assisted_machine: 'assisted-machine',
};

export interface CustomExerciseInput {
  name: string;
  kind: ExerciseKind;
  region: Region | null;
  pull: boolean;
  perSide: 'leg' | 'arm' | 'side' | null;
  cues: string;
}

export function kindOf(e: Exercise): ExerciseKind {
  if (e.measure === 'time') return 'timed';
  if (e.measure === 'distance') return 'distance';
  if (e.measure === 'duration') return 'cardio';
  const map: Record<LoadType, ExerciseKind> = {
    plates: 'barbell', barbell_total: 'barbell_total', dumbbell_per_hand: 'dumbbell', machine: 'machine', cable: 'cable',
    bodyweight: 'bodyweight', assisted_machine: 'assisted', cardio: 'cardio',
  };
  return map[e.loadType];
}

export function validateExercise(input: CustomExerciseInput, existing: Exercise[], editingId?: string): string[] {
  const problems: string[] = [];
  const name = input.name.trim();
  if (!name) problems.push('Give the exercise a name.');
  if (existing.some((e) => e.id !== editingId && e.name.trim().toLowerCase() === name.toLowerCase())) problems.push(`An exercise called "${name}" already exists.`);
  if (input.kind !== 'cardio' && !input.region) problems.push('Choose the main body region.');
  return problems;
}

export function buildExercise(input: CustomExerciseInput, id: string): Exercise {
  const { loadType, measure } = KIND[input.kind];
  const profile = PROFILE[loadType];
  return {
    id,
    name: input.name.trim(),
    loadType,
    measure,
    loadConvention: CONVENTION[loadType],
    cues: input.cues.split('\n').map((c) => c.trim()).filter(Boolean),
    alternatives: [],
    ...(profile ? { equipmentProfileId: profile } : {}),
    tags: [],
    custom: true,
    region: input.kind === 'cardio' ? null : input.region,
    pull: input.pull,
    ...(input.perSide ? { perSide: input.perSide } : {}),
  };
}

// ---------------------------------------------------------------------------
// Custom workouts

export interface SlotDraft {
  /** Kept when editing, so history and targets stay attached. Empty for new rows. */
  slotKey: string;
  exerciseId: string;
  sets: number;
  min: number;
  max: number;
  rirMin: number | null;
  rirMax: number | null;
  restMin: number | null;
  restMax: number | null;
  notes: string;
  /** Starting load (kg, or kg of assistance). Becomes a target, not part of the workout. */
  targetKg: number | null;
  supersetWithPrevious: boolean;
  /** Timed holds only: "as long as you can" (e.g. dead hang 2 × max) instead of a range. */
  maxEffort?: boolean;
}

export interface WorkoutDraft {
  name: string;
  demand: Demand;
  notes: string;
  slots: SlotDraft[];
}

/** Sensible defaults for a newly added exercise. */
export function defaultSlot(e: Exercise): SlotDraft {
  const base = { slotKey: '', exerciseId: e.id, notes: '', targetKg: null, supersetWithPrevious: false };
  switch (e.measure) {
    case 'time':
      return { ...base, sets: 3, min: 20, max: 40, rirMin: null, rirMax: null, restMin: 60, restMax: 60 };
    case 'distance':
      return { ...base, sets: 3, min: 30, max: 40, rirMin: null, rirMax: null, restMin: 60, restMax: 90 };
    case 'duration':
      return { ...base, sets: 1, min: 15, max: 20, rirMin: null, rirMax: null, restMin: null, restMax: null };
    default:
      return { ...base, sets: 3, min: 8, max: 12, rirMin: 1, rirMax: 2, restMin: 90, restMax: 90 };
  }
}

export function unitOf(e: Exercise): string {
  return e.measure === 'time' ? 's' : e.measure === 'distance' ? 'm' : e.measure === 'duration' ? 'min' : 'reps';
}

export function validateWorkout(d: WorkoutDraft, exercises: ReadonlyMap<string, Exercise>, others: WorkoutTemplate[], editingCode?: string): string[] {
  const problems: string[] = [];
  const name = d.name.trim();
  if (!name) problems.push('Give the workout a name.');
  if (others.some((t) => t.code !== editingCode && !t.archived && t.name.trim().toLowerCase() === name.toLowerCase())) problems.push(`A workout called "${name}" already exists.`);
  if (!d.slots.length) problems.push('Add at least one exercise.');
  d.slots.forEach((s, i) => {
    const e = exercises.get(s.exerciseId);
    const where = `Exercise ${i + 1}${e ? ` (${e.name})` : ''}`;
    if (!e) return problems.push(`${where}: unknown exercise.`);
    const whole = (v: number) => Number.isInteger(v) && v >= 1;
    if (e.measure !== 'duration' && (!whole(s.sets) || s.sets > 10)) problems.push(`${where}: sets must be 1–10.`);
    const maxHold = e.measure === 'time' && s.maxEffort;
    if (!maxHold && (!(s.min > 0) || !(s.max >= s.min))) problems.push(`${where}: the ${unitOf(e)} range must go from low to high.`);
    if (e.measure === 'reps' && (!Number.isInteger(s.min) || !Number.isInteger(s.max))) problems.push(`${where}: reps must be whole numbers.`);
    if ((s.rirMin === null) !== (s.rirMax === null) || (s.rirMin !== null && (s.rirMin < 0 || s.rirMax! < s.rirMin || s.rirMax! > 5))) problems.push(`${where}: RIR must be 0–5, low to high, or left empty.`);
    if ((s.restMin === null) !== (s.restMax === null) || (s.restMin !== null && (s.restMin < 0 || s.restMax! < s.restMin))) problems.push(`${where}: rest must go from low to high, or be left empty.`);
    if (s.targetKg !== null && !(s.targetKg >= 0)) problems.push(`${where}: target weight can't be negative.`);
    if (s.supersetWithPrevious && i === 0) problems.push(`${where}: the first exercise can't be in a superset with the previous one.`);
  });
  return problems;
}

export function ruleFor(e: Exercise, s: Pick<SlotDraft, 'max' | 'maxEffort'>): ProgressionRule {
  if (e.measure === 'duration') return { id: 'none' };
  if (e.measure === 'time' && s.maxEffort) return { id: 'max_hang' };
  if (e.measure === 'time') return { id: 'timed_hold', stepSec: 5 };
  if (e.measure === 'distance') return { id: 'distance_load' };
  if (e.loadType === 'assisted_machine') return { id: 'assisted_reps' };
  if (e.loadType === 'bodyweight') return { id: 'bodyweight_reps', capReps: s.max };
  return { id: 'load_double' };
}

function targetFor(e: Exercise, s: SlotDraft): SlotTarget {
  switch (e.measure) {
    case 'time':
      return s.maxEffort ? { kind: 'max_time' } : { kind: 'time', minSec: s.min, maxSec: s.max };
    case 'distance':
      return { kind: 'distance', minM: s.min, maxM: s.max };
    case 'duration':
      return { kind: 'duration', minMin: s.min, maxMin: s.max };
    default:
      return { kind: 'reps', min: s.min, max: s.max };
  }
}

const range = (min: number | null, max: number | null): Range | null => (min === null || max === null ? null : { min, max });

/** What the scheduler needs to know about a custom workout, derived from its exercises. */
export function traits(slots: SlotDraft[], exercises: ReadonlyMap<string, Exercise>): Pick<WorkoutTemplate, 'regions' | 'pullRole' | 'pullVolume' | 'gripLoad'> {
  const list = slots.map((s) => exercises.get(s.exerciseId)).filter((e): e is Exercise => !!e);
  const regions = (['upper', 'lower', 'core'] as Region[]).filter((r) => list.some((e) => e.region === r));
  const pullUp = list.some((e) => e.tags.includes('pull-up-path'));
  return {
    regions,
    pullRole: pullUp ? 'light' : 'none',
    pullVolume: list.some((e) => e.pull),
    gripLoad: list.some((e) => e.tags.includes('grip') || e.pull),
  };
}

/**
 * Builds the workout. Existing slot keys are kept; new rows get fresh keys from
 * `newSlotKey`, and keys are never reused, so past sessions stay intact.
 */
export function buildWorkout(
  d: WorkoutDraft,
  exercises: ReadonlyMap<string, Exercise>,
  ids: { id: string; code: string; newSlotKey: () => string },
): WorkoutTemplate {
  let group = 0;
  const slots: TemplateSlot[] = d.slots.map((s, i) => {
    const e = exercises.get(s.exerciseId)!;
    const next = d.slots[i + 1];
    const inGroup = s.supersetWithPrevious || next?.supersetWithPrevious;
    if (inGroup && !s.supersetWithPrevious) group += 1;
    return {
      slotKey: s.slotKey || ids.newSlotKey(),
      order: i + 1,
      exerciseId: s.exerciseId,
      name: e.name,
      sets: e.measure === 'duration' ? null : s.sets,
      target: targetFor(e, s),
      perSide: e.perSide ?? null,
      rir: e.measure === 'reps' ? range(s.rirMin, s.rirMax) : null,
      restSec: range(s.restMin, s.restMax),
      notes: s.notes.trim() ? [s.notes.trim()] : [],
      ...(inGroup ? { supersetGroup: `${ids.code}-ss${group}` } : {}),
      rule: ruleFor(e, s),
    };
  });
  return {
    id: ids.id,
    kind: 'custom',
    code: ids.code,
    name: d.name.trim(),
    focus: [...new Set(slots.map((s) => exercises.get(s.exerciseId)?.region).filter(Boolean))].join(', '),
    pullUpWork: '—',
    estMinutes: null,
    demand: d.demand,
    ...traits(d.slots, exercises),
    easyDay: d.demand === 'easy',
    notes: d.notes.trim() ? [d.notes.trim()] : [],
    slots,
  };
}

/** Back from a saved workout to an editable draft (targets come from the current prescriptions). */
export function toDraft(t: WorkoutTemplate, targetKg: (slot: TemplateSlot) => number | null): WorkoutDraft {
  return {
    name: t.name,
    demand: t.demand,
    notes: t.notes.join('\n'),
    slots: t.slots.map((s, i) => {
      const [min, max] =
        s.target.kind === 'reps' ? [s.target.min, s.target.max]
        : s.target.kind === 'time' ? [s.target.minSec, s.target.maxSec]
        : s.target.kind === 'distance' ? [s.target.minM, s.target.maxM]
        : s.target.kind === 'duration' ? [s.target.minMin, s.target.maxMin]
        : [20, 40]; // max hold: keep a sensible range ready if the box is unticked
      return {
        slotKey: s.slotKey,
        exerciseId: s.exerciseId,
        sets: s.sets ?? 1,
        min,
        max,
        rirMin: s.rir?.min ?? null,
        rirMax: s.rir?.max ?? null,
        restMin: s.restSec?.min ?? null,
        restMax: s.restSec?.max ?? null,
        notes: s.notes.join('\n'),
        targetKg: targetKg(s),
        supersetWithPrevious: i > 0 && !!s.supersetGroup && s.supersetGroup === t.slots[i - 1]!.supersetGroup,
        ...(s.target.kind === 'max_time' ? { maxEffort: true } : {}),
      };
    }),
  };
}
