// Program v2, transcribed from "Fitness Coaching — Week 1 Summary" (18 Oct 2026).
// This is the immutable original: exercise selection, order, sets, rep ranges, RIR,
// rest and notes exactly as written. Adaptation happens in the prescription layer.

import type { ProgramVersion, ProgressionRule, Range, SlotTarget, TemplateSlot, WorkoutTemplate } from '../model';

export const PROGRAM_V2_ID = 'program-v2';

const reps = (min: number, max = min): SlotTarget => ({ kind: 'reps', min, max });
const time = (minSec: number, maxSec = minSec): SlotTarget => ({ kind: 'time', minSec, maxSec });
const MAX_TIME: SlotTarget = { kind: 'max_time' };
const r = (min: number, max = min): Range => ({ min, max });

const LOAD: ProgressionRule = { id: 'load_double' };

function slot(
  code: string,
  order: number,
  exerciseId: string,
  name: string,
  sets: number | null,
  target: SlotTarget,
  rir: Range | null,
  restSec: Range | null,
  rule: ProgressionRule,
  extra: Partial<Pick<TemplateSlot, 'perSide' | 'notes' | 'supersetGroup' | 'linkGroup' | 'slotKey'>> = {},
): TemplateSlot {
  return {
    slotKey: extra.slotKey ?? `${code}-${String(order).padStart(2, '0')}`,
    order,
    exerciseId,
    name,
    sets,
    target,
    perSide: extra.perSide ?? null,
    rir,
    restSec,
    notes: extra.notes ?? [],
    ...(extra.supersetGroup ? { supersetGroup: extra.supersetGroup } : {}),
    ...(extra.linkGroup ? { linkGroup: extra.linkGroup } : {}),
    rule,
  };
}

const A: WorkoutTemplate = {
  id: 'v2-A',
  code: 'A',
  name: 'Push + pull-up practice',
  focus: 'Chest, shoulders, triceps',
  pullUpWork: 'Light: hangs, scapular',
  estMinutes: 55,
  demand: 'moderate',
  regions: ['upper'],
  pullRole: 'light',
  gripLoad: true,
  easyDay: false,
  notes: [],
  slots: [
    slot('A', 1, 'dead-hang', 'Dead hang', 2, MAX_TIME, null, r(60), { id: 'max_hang' }),
    slot('A', 2, 'scapular-pull-up', 'Scapular pull-ups', 2, reps(8), r(2, 3), r(60), { id: 'bodyweight_reps', capReps: 10, requirePause: true }),
    slot('A', 3, 'barbell-bench-press', 'Barbell bench press', 4, reps(6, 8), r(2), r(120, 180), { id: 'load_double', stepKg: 2.5 }),
    slot('A', 4, 'seated-db-shoulder-press', 'Seated dumbbell shoulder press', 3, reps(8, 10), r(2), r(90), LOAD),
    slot('A', 5, 'incline-db-press', 'Incline dumbbell press (30°)', 3, reps(8, 12), r(1, 2), r(90), LOAD),
    slot('A', 6, 'db-lateral-raise', 'Dumbbell lateral raises', 3, reps(12, 15), r(1, 2), r(60), LOAD, { linkGroup: 'lateral-raise' }),
    slot('A', 7, 'cable-triceps-pushdown', 'Cable triceps pushdown', 3, reps(10, 12), r(1), r(60), LOAD),
  ],
};

const B: WorkoutTemplate = {
  id: 'v2-B',
  code: 'B',
  name: 'Legs + core',
  focus: 'Squat, hinge, core',
  pullUpWork: 'Hanging knee raises (grip)',
  estMinutes: 50,
  demand: 'hard',
  regions: ['lower', 'core'],
  pullRole: 'none',
  gripLoad: true,
  easyDay: false,
  notes: [],
  slots: [
    slot('B', 1, 'barbell-back-squat', 'Barbell back squat', 3, reps(6, 8), r(2), r(120, 180), { id: 'load_double', stepKg: 5 }),
    slot('B', 2, 'romanian-deadlift', 'Romanian deadlift', 3, reps(8, 10), r(2), r(120), { id: 'load_double', stepKg: 5 }),
    slot('B', 3, 'db-bulgarian-split-squat', 'Dumbbell Bulgarian split squat', 2, reps(8, 10), r(2), r(90), LOAD, { perSide: 'leg' }),
    slot('B', 4, 'leg-curl', 'Leg curl (machine)', 2, reps(10, 12), r(1), r(60), LOAD),
    slot('B', 5, 'hanging-knee-raise', 'Hanging knee raises', 3, reps(8, 12), r(1, 2), r(60), { id: 'bodyweight_reps', capReps: 12 }),
    slot('B', 6, 'hollow-body-hold', 'Hollow body hold', 3, time(20, 40), null, r(60), { id: 'timed_hold', stepSec: 5 }),
  ],
};

const C: WorkoutTemplate = {
  id: 'v2-C',
  code: 'C',
  name: 'Pull + pull-ups, main day',
  focus: 'Back, biceps, grip',
  pullUpWork: 'Main: negatives + assisted',
  estMinutes: 60,
  demand: 'hard',
  regions: ['upper'],
  pullRole: 'main',
  gripLoad: true,
  easyDay: false,
  notes: [],
  slots: [
    slot('C', 1, 'scapular-pull-up', 'Scapular pull-ups', 2, reps(8), r(3), r(60), { id: 'bodyweight_reps', capReps: 10, requirePause: true }),
    slot('C', 2, 'assisted-negative-pull-up', 'Assisted negative pull-ups (5 s lowering)', 4, reps(3), null, r(120), { id: 'assisted_negative', tempoSec: 5 }, {
      notes: ['5 s lowering'],
    }),
    slot('C', 3, 'assisted-pull-up', 'Assisted pull-ups (machine)', 3, reps(6, 8), r(1, 2), r(120), { id: 'assisted_reps' }),
    slot('C', 4, 'lat-pulldown', 'Lat pulldown', 3, reps(8, 12), r(1, 2), r(90), LOAD),
    slot('C', 5, 'single-arm-db-row', 'Single-arm dumbbell row', 3, reps(10, 12), r(1, 2), r(60, 90), LOAD, { perSide: 'arm' }),
    slot('C', 6, 'cable-face-pull', 'Cable face pulls', 2, reps(12, 15), r(2), r(60), LOAD),
    slot('C', 7, 'barbell-curl', 'Barbell or EZ-bar curls', 3, reps(8, 12), r(1), r(60), LOAD),
    slot('C', 8, 'dead-hang', 'Dead hang', 2, MAX_TIME, null, r(60), { id: 'max_hang' }, { notes: ['End of session'] }),
  ],
};

const E: WorkoutTemplate = {
  id: 'v2-E',
  code: 'E',
  name: 'Easy lower + core + zone 2',
  focus: 'Light legs, core, zone 2 cardio, all RIR 3',
  pullUpWork: '—',
  estMinutes: 45,
  demand: 'easy',
  regions: ['lower', 'core'],
  pullRole: 'none',
  gripLoad: false,
  easyDay: true,
  notes: [
    'No pulling or pressing on this day, so arms and grip are fresh for Saturday.',
    'Flag: the focus says "all RIR 3" but standing calf raises are prescribed at RIR 2. Kept as written.',
  ],
  slots: [
    slot('E', 1, 'leg-press', 'Leg press', 3, reps(10, 12), r(3), r(90), LOAD),
    slot('E', 2, 'db-walking-lunge', 'Dumbbell walking lunges', 2, reps(10), r(3), r(90), LOAD, { perSide: 'leg' }),
    slot('E', 3, 'back-extension-45', '45° back extension', 2, reps(12), r(3), r(60), { id: 'bodyweight_reps', capReps: 12 }),
    slot('E', 4, 'standing-calf-raise', 'Standing calf raises', 3, reps(12, 15), r(2), r(60), LOAD),
    slot('E', 5, 'dead-bug', 'Dead bug', 3, reps(8), null, r(45), { id: 'bodyweight_reps', capReps: 8 }, { perSide: 'side' }),
    slot('E', 6, 'side-plank', 'Side plank', 2, time(30), null, r(45), { id: 'timed_hold', stepSec: 5 }, { perSide: 'side' }),
    slot('E', 7, 'bike-or-incline-walk', 'Bike or incline walk, easy', null, { kind: 'duration', minMin: 15, maxMin: 20 }, null, null, { id: 'none' }),
  ],
};

const D: WorkoutTemplate = {
  id: 'v2-D',
  code: 'D',
  name: 'Upper volume',
  focus: 'Chest, rows, shoulders, arms',
  pullUpWork: 'Light: hangs + carries',
  estMinutes: 55,
  demand: 'moderate',
  regions: ['upper'],
  pullRole: 'light',
  gripLoad: true,
  easyDay: false,
  notes: [],
  slots: [
    slot('D', 1, 'dead-hang', 'Dead hang', 2, MAX_TIME, null, r(60), { id: 'max_hang' }),
    slot('D', 2, 'db-bench-press', 'Dumbbell bench press (flat)', 3, reps(8, 12), r(1, 2), r(120), LOAD),
    slot('D', 3, 'seated-cable-row', 'Seated cable row', 3, reps(10, 12), r(1, 2), r(90), LOAD),
    slot('D', 4, 'assisted-dip', 'Assisted dips (machine)', 3, reps(6, 10), r(2), r(90), { id: 'assisted_reps' }),
    slot('D', 5, 'db-lateral-raise', 'Dumbbell lateral raises', 3, reps(12, 15), r(1, 2), r(60), LOAD, { linkGroup: 'lateral-raise' }),
    slot('D', 6, 'incline-db-curl', 'Incline DB curl', 2, reps(10, 12), r(1), r(60), LOAD, { slotKey: 'D-06a', supersetGroup: 'D-06' }),
    slot('D', 6, 'overhead-cable-triceps', 'Overhead cable triceps extension', 2, reps(10, 12), r(1), r(60), LOAD, {
      slotKey: 'D-06b',
      supersetGroup: 'D-06',
    }),
    slot('D', 7, 'farmers-carry', "Farmer's carry", 3, { kind: 'distance', minM: 30, maxM: 40 }, null, r(60, 90), { id: 'distance_load' }),
  ],
};

export const PROGRAM_V2: ProgramVersion = {
  id: PROGRAM_V2_ID,
  label: 'Program v2',
  parentId: null,
  createdAt: '2026-10-18',
  source: 'import',
  isOriginal: true,
  changeNote: 'Imported from "Fitness Coaching — Week 1 Summary" (18 Oct 2026).',
  canonicalOrder: ['A', 'B', 'C', 'E', 'D'],
  notes: [
    'Five sessions on a fixed week with Sunday off: pull-up work 3× per week, but only one hard pull day.',
    'Weight goes up only when every set reaches the top of its rep range at the target RIR with clean technique.',
    'Warm-up (8–10 min): 3–5 min easy cardio, arm circles, face pulls or band pull-aparts × 15, 10 bodyweight squats. Before the first main lift: ~50% × 8, then ~75% × 4.',
    'Missed reps: 1–2 short → repeat the weight. Short twice in a row, or form breaking → drop 5–10%. Reps with a shortened range or swinging don\'t count.',
    'Safety: sharp, pinching or joint pain means stop that exercise, use the alternative and report it. Soreness is not a measure of a good session.',
    'Test a strict pull-up only when the negatives, assisted pull-ups and hangs all hit their targets. Test fresh, at the start of the main pull day.',
  ],
  pullUpMilestones: [
    { id: 'dead-hang', name: 'Dead hang', target: '45–60 s', reached: true },
    { id: 'scapular', name: 'Scapular pull-ups', target: '2 × 10 with a clear 1 s pause', reached: false },
    { id: 'negatives', name: 'Assisted negatives', target: '4 × 3 unassisted at 5 s each', reached: false },
    { id: 'assisted', name: 'Assisted pull-ups', target: '3 × 8 at ≤20 kg assistance', reached: false },
  ],
  templates: [A, B, C, E, D],
};
