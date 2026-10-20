import type { Exercise, LoadType, Measure, Region } from '../model';

const CONVENTION: Record<LoadType, string> = {
  plates: 'Plates only, bar/sled not counted (e.g. "20 kg" = 10 kg per side).',
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

const U: Region = 'upper';
const L: Region = 'lower';
const K: Region = 'core';

/** Main body region per built-in exercise (cardio has none). */
const REGION: Record<string, Region> = {
  'dead-hang': U, 'scapular-pull-up': U, 'assisted-negative-pull-up': U, 'assisted-pull-up': U, 'pull-up': U,
  'barbell-bench-press': U, 'seated-db-shoulder-press': U, 'incline-db-press': U, 'db-lateral-raise': U,
  'cable-triceps-pushdown': U, 'db-bench-press': U, 'assisted-dip': U, 'overhead-cable-triceps': U,
  'lat-pulldown': U, 'single-arm-db-row': U, 'cable-face-pull': U, 'barbell-curl': U, 'incline-db-curl': U,
  'seated-cable-row': U, 'farmers-carry': U,
  'barbell-back-squat': L, 'romanian-deadlift': L, 'db-bulgarian-split-squat': L, 'leg-curl': L, 'leg-press': L,
  'db-walking-lunge': L, 'back-extension-45': L, 'standing-calf-raise': L,
  'hanging-knee-raise': K, 'hollow-body-hold': K, 'dead-bug': K, 'side-plank': K,
};

/** Loaded pulling that tires the back for next-day pull-ups. */
const PULL = new Set(['assisted-negative-pull-up', 'assisted-pull-up', 'pull-up', 'lat-pulldown', 'single-arm-db-row', 'seated-cable-row']);

const PER_SIDE: Record<string, 'leg' | 'arm' | 'side'> = {
  'db-bulgarian-split-squat': 'leg', 'db-walking-lunge': 'leg', 'single-arm-db-row': 'arm', 'dead-bug': 'side', 'side-plank': 'side',
};

function ex(
  id: string,
  name: string,
  loadType: LoadType,
  measure: Measure,
  cues: string[],
  opts: { tags?: string[]; equipmentProfileId?: string; loadConvention?: string } = {},
): Exercise {
  const profile = opts.equipmentProfileId ?? PROFILE[loadType];
  return {
    id,
    name,
    loadType,
    measure,
    loadConvention: opts.loadConvention ?? CONVENTION[loadType],
    cues,
    alternatives: [], // listed in the coach's Week 1 PDF, which is not in the project
    ...(profile ? { equipmentProfileId: profile } : {}),
    tags: opts.tags ?? [],
    custom: false,
    region: REGION[id] ?? null,
    pull: PULL.has(id),
    ...(PER_SIDE[id] ? { perSide: PER_SIDE[id] } : {}),
  };
}

// Cues: Week 2 program sheet (19–23 Oct 2026).
export const EXERCISES: Exercise[] = [
  // Pull-up path
  ex('dead-hang', 'Dead hang', 'bodyweight', 'time', ['Stop ~5 s before grip gives out.'], { tags: ['pull-up-path', 'grip'] }),
  ex('scapular-pull-up', 'Scapular pull-ups', 'bodyweight', 'reps', ['Straight arms; pull shoulder blades down and back, hold 1 s at the top, lower slowly.'], { tags: ['pull-up-path'] }),
  ex('assisted-negative-pull-up', 'Assisted negative pull-ups', 'assisted_machine', 'reps', ['Chin over the bar, lower in a steady 5 s to a full dead hang. Reset each rep.'], { tags: ['pull-up-path'] }),
  ex('assisted-pull-up', 'Assisted pull-ups (machine)', 'assisted_machine', 'reps', ['Dead hang to chin over bar, full range.'], { tags: ['pull-up-path'] }),
  ex('pull-up', 'Strict pull-up', 'bodyweight', 'reps', ['Start from a still dead hang, chin clearly over the bar, controlled lowering, no kip or swing.'], { tags: ['pull-up-path'] }),
  // Push
  ex('barbell-bench-press', 'Barbell bench press', 'plates', 'reps', ['Blades back and down, bar to lower chest, no bounce.']),
  ex('seated-db-shoulder-press', 'Seated dumbbell shoulder press', 'dumbbell_per_hand', 'reps', ['Back on the pad, no arching to finish.']),
  ex('incline-db-press', 'Incline dumbbell press', 'dumbbell_per_hand', 'reps', ['Bench ~30°.']),
  ex('db-lateral-raise', 'Dumbbell lateral raises', 'dumbbell_per_hand', 'reps', ['No swing, no shrug.']),
  ex('cable-triceps-pushdown', 'Cable triceps pushdown', 'cable', 'reps', ['Elbows pinned, full lockout.']),
  ex('db-bench-press', 'Dumbbell bench press (flat)', 'dumbbell_per_hand', 'reps', ['Blades back and down.']),
  ex('assisted-dip', 'Assisted dips (machine)', 'assisted_machine', 'reps', ['Slight lean, upper arms to parallel.']),
  ex('overhead-cable-triceps', 'Overhead cable triceps extension', 'cable', 'reps', []),
  // Pull
  ex('lat-pulldown', 'Lat pulldown', 'cable', 'reps', ['Chest up, elbows down to the ribs, 2–3 s up.']),
  ex('single-arm-db-row', 'Single-arm dumbbell row', 'dumbbell_per_hand', 'reps', ['Elbow toward the hip, pause, full stretch.']),
  ex('cable-face-pull', 'Cable face pulls', 'cable', 'reps', ['Pull to the face, hands end beside the ears, 1 s hold.']),
  ex('barbell-curl', 'Barbell or EZ-bar curls', 'barbell_total', 'reps', ['Elbows fixed, no swing.'], {
    loadConvention: 'Total weight including the bar (exception to "plates only").',
  }),
  ex('incline-db-curl', 'Incline dumbbell curl', 'dumbbell_per_hand', 'reps', []),
  ex('seated-cable-row', 'Seated cable row', 'cable', 'reps', ['Pull to lower ribs, squeeze, full stretch.']),
  ex('farmers-carry', "Farmer's carry", 'dumbbell_per_hand', 'distance', ['Tall posture, walk steady.'], { tags: ['grip'] }),
  // Legs
  ex('barbell-back-squat', 'Barbell back squat', 'plates', 'reps', ['Sit down and back, knees track toes, at least parallel.']),
  ex('romanian-deadlift', 'Romanian deadlift', 'plates', 'reps', ['Soft knees, hips back, flat back.']),
  ex('db-bulgarian-split-squat', 'Dumbbell Bulgarian split squat', 'dumbbell_per_hand', 'reps', ['Rear foot on bench, drop straight down.']),
  ex('leg-curl', 'Leg curl (machine)', 'machine', 'reps', ['Hips down, 1 s squeeze, 2–3 s lowering.']),
  ex('leg-press', 'Leg press', 'plates', 'reps', ['Knees to ~90°, lower back on the pad.'], { equipmentProfileId: 'leg-press-plates' }),
  ex('db-walking-lunge', 'Dumbbell walking lunges', 'dumbbell_per_hand', 'reps', ['Long step, torso tall.']),
  ex('back-extension-45', '45° back extension', 'bodyweight', 'reps', ['Hinge at hips, no hyperextension.']),
  ex('standing-calf-raise', 'Standing calf raises', 'dumbbell_per_hand', 'reps', ['Full stretch, 1 s pause at top.']),
  // Core
  ex('hanging-knee-raise', 'Hanging knee raises', 'bodyweight', 'reps', ['Knees to chest, 1 s pause, no swing.'], { tags: ['grip'] }),
  ex('hollow-body-hold', 'Hollow body hold', 'bodyweight', 'time', ['Lower back stays pressed down.']),
  ex('dead-bug', 'Dead bug', 'bodyweight', 'reps', ['Lower back pressed to the floor.']),
  ex('side-plank', 'Side plank', 'bodyweight', 'time', ['Hips high, straight line.']),
  // Cardio
  ex('bike-or-incline-walk', 'Bike or incline walk (zone 2)', 'cardio', 'duration', ['Easy, full sentences possible.']),
  ex('cycling', 'Cycling', 'cardio', 'duration', []),
];

export const EXERCISES_BY_ID: ReadonlyMap<string, Exercise> = new Map(EXERCISES.map((e) => [e.id, e]));
