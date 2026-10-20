import type { EquipmentKind, Exercise, LoadType, Measure, Muscle, Pattern, Region } from '../model';
import catalog from './catalog.json';

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
  // Staples used by the ready-made programs.
  'push-up': U, 'barbell-overhead-press': U, 'barbell-row': U,
  'goblet-squat': L, 'deadlift': L, 'hip-thrust': L, 'plank': K,
};

/** Loaded pulling that tires the back for next-day pull-ups. */
const PULL = new Set(['assisted-negative-pull-up', 'assisted-pull-up', 'pull-up', 'lat-pulldown', 'single-arm-db-row', 'seated-cable-row', 'barbell-row']);

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
/** The app's own exercises (ids used by Program v2 and history; never renamed). */
const APP_EXERCISES: Exercise[] = [
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
  // Staples used by the ready-made programs (cues: standard technique).
  ex('push-up', 'Push-up', 'bodyweight', 'reps', ['Body in a straight line, chest to just above the floor.', 'Too hard? Hands on a bench.']),
  ex('goblet-squat', 'Goblet squat', 'dumbbell_per_hand', 'reps', ['Hold one dumbbell at the chest, sit between the heels, chest up.'], { loadConvention: 'Weight of the one dumbbell.' }),
  ex('barbell-overhead-press', 'Barbell overhead press', 'plates', 'reps', ['Glutes tight, bar from the collarbone to over the head, no leaning back.']),
  ex('barbell-row', 'Barbell row', 'plates', 'reps', ['Hinge to ~45°, flat back, pull the bar to the lower ribs.']),
  ex('deadlift', 'Deadlift', 'plates', 'reps', ['Bar over mid-foot, flat back, push the floor away, lock out with the glutes.']),
  ex('hip-thrust', 'Hip thrust', 'plates', 'reps', ['Upper back on a bench, chin tucked, squeeze the glutes at the top.']),
  ex('plank', 'Plank', 'bodyweight', 'time', ['Elbows under shoulders, straight line from head to heels.']),
];

/** Library metadata for the app's own exercises (muscles come from the catalog where it has them). */
const APP_META: Record<string, { pattern: Pattern; equipmentKind: EquipmentKind; muscles?: Muscle[] }> = {
  'dead-hang': { pattern: 'carry', equipmentKind: 'bodyweight', muscles: ['forearms', 'lats'] },
  'scapular-pull-up': { pattern: 'vertical-pull', equipmentKind: 'bodyweight' },
  'assisted-negative-pull-up': { pattern: 'vertical-pull', equipmentKind: 'machine', muscles: ['lats', 'biceps'] },
  'assisted-pull-up': { pattern: 'vertical-pull', equipmentKind: 'machine', muscles: ['lats', 'biceps'] },
  'pull-up': { pattern: 'vertical-pull', equipmentKind: 'bodyweight' },
  'barbell-bench-press': { pattern: 'horizontal-push', equipmentKind: 'barbell' },
  'seated-db-shoulder-press': { pattern: 'vertical-push', equipmentKind: 'dumbbell' },
  'incline-db-press': { pattern: 'horizontal-push', equipmentKind: 'dumbbell' },
  'db-lateral-raise': { pattern: 'isolation', equipmentKind: 'dumbbell' },
  'cable-triceps-pushdown': { pattern: 'isolation', equipmentKind: 'cable' },
  'db-bench-press': { pattern: 'horizontal-push', equipmentKind: 'dumbbell' },
  'assisted-dip': { pattern: 'vertical-push', equipmentKind: 'machine', muscles: ['triceps', 'chest'] },
  'overhead-cable-triceps': { pattern: 'isolation', equipmentKind: 'cable' },
  'lat-pulldown': { pattern: 'vertical-pull', equipmentKind: 'cable' },
  'single-arm-db-row': { pattern: 'horizontal-pull', equipmentKind: 'dumbbell' },
  'cable-face-pull': { pattern: 'horizontal-pull', equipmentKind: 'cable' },
  'barbell-curl': { pattern: 'isolation', equipmentKind: 'barbell' },
  'incline-db-curl': { pattern: 'isolation', equipmentKind: 'dumbbell' },
  'seated-cable-row': { pattern: 'horizontal-pull', equipmentKind: 'cable' },
  'farmers-carry': { pattern: 'carry', equipmentKind: 'dumbbell' },
  'barbell-back-squat': { pattern: 'squat', equipmentKind: 'barbell' },
  'romanian-deadlift': { pattern: 'hinge', equipmentKind: 'barbell' },
  'db-bulgarian-split-squat': { pattern: 'lunge', equipmentKind: 'dumbbell' },
  'leg-curl': { pattern: 'isolation', equipmentKind: 'machine' },
  'leg-press': { pattern: 'squat', equipmentKind: 'machine' },
  'db-walking-lunge': { pattern: 'lunge', equipmentKind: 'dumbbell' },
  'back-extension-45': { pattern: 'hinge', equipmentKind: 'bodyweight' },
  'standing-calf-raise': { pattern: 'isolation', equipmentKind: 'dumbbell', muscles: ['calves'] },
  'hanging-knee-raise': { pattern: 'core', equipmentKind: 'bodyweight', muscles: ['abs'] },
  'hollow-body-hold': { pattern: 'core', equipmentKind: 'bodyweight', muscles: ['abs'] },
  'dead-bug': { pattern: 'core', equipmentKind: 'bodyweight' },
  'side-plank': { pattern: 'core', equipmentKind: 'bodyweight' },
  'bike-or-incline-walk': { pattern: 'conditioning', equipmentKind: 'machine' },
  cycling: { pattern: 'conditioning', equipmentKind: 'other' },
  'push-up': { pattern: 'horizontal-push', equipmentKind: 'bodyweight' },
  'goblet-squat': { pattern: 'squat', equipmentKind: 'dumbbell' },
  'barbell-overhead-press': { pattern: 'vertical-push', equipmentKind: 'barbell' },
  'barbell-row': { pattern: 'horizontal-pull', equipmentKind: 'barbell' },
  deadlift: { pattern: 'hinge', equipmentKind: 'barbell' },
  'hip-thrust': { pattern: 'hinge', equipmentKind: 'barbell' },
  plank: { pattern: 'core', equipmentKind: 'bodyweight' },
};

/** Street workout / calisthenics skills the catalog lacks, with progressions in the cues. */
function sw(id: string, name: string, measure: Measure, pattern: Pattern, muscles: Muscle[], level: Exercise['level'], cues: string[], perSide?: 'leg' | 'arm'): Exercise {
  const lower = muscles.some((m) => ['quads', 'hamstrings', 'glutes', 'calves'].includes(m));
  return {
    id: `sw-${id}`,
    name,
    loadType: 'bodyweight',
    measure,
    loadConvention: 'Bodyweight.',
    cues,
    alternatives: [],
    tags: ['calisthenics'],
    custom: false,
    region: lower ? 'lower' : pattern === 'core' && muscles[0] === 'abs' ? 'core' : 'upper',
    pull: pattern === 'vertical-pull' || pattern === 'horizontal-pull',
    ...(perSide ? { perSide } : {}),
    muscles,
    pattern,
    equipmentKind: 'bodyweight',
    level,
    category: 'calisthenics',
  };
}

const STREET: Exercise[] = [
  sw('l-sit', 'L-sit', 'time', 'core', ['abs', 'triceps'], 'intermediate', ['Hands on parallettes or the floor, legs straight and level, shoulders pushed down.', 'Progression: tuck L-sit, then one leg out, then full L-sit.']),
  sw('tuck-front-lever', 'Tuck front lever', 'time', 'core', ['lats', 'abs'], 'intermediate', ['Hang, pull the bar towards the hips with straight arms, knees tucked, back flat.', 'Progression: tuck, advanced tuck, one leg, full front lever.']),
  sw('front-lever', 'Front lever', 'time', 'core', ['lats', 'abs'], 'expert', ['Body horizontal and straight under the bar, arms straight, hips level.']),
  sw('tuck-back-lever', 'Tuck back lever', 'time', 'core', ['lats', 'chest', 'biceps'], 'intermediate', ['From a skin-the-cat position, hold the body horizontal facing down, knees tucked.', 'Progression: tuck, advanced tuck, straddle, full.']),
  sw('planche-lean', 'Planche lean', 'time', 'horizontal-push', ['shoulders', 'chest'], 'intermediate', ['Push-up position, fingers turned out, lean the shoulders well past the hands, arms locked.']),
  sw('tuck-planche', 'Tuck planche', 'time', 'horizontal-push', ['shoulders', 'chest'], 'expert', ['Hands only on the floor, knees tucked to the chest, arms straight, back rounded.']),
  sw('pseudo-planche-push-up', 'Pseudo planche push-up', 'reps', 'horizontal-push', ['shoulders', 'chest', 'triceps'], 'intermediate', ['Hands by the hips, lean forward and keep the lean through every rep.']),
  sw('archer-push-up', 'Archer push-up', 'reps', 'horizontal-push', ['chest', 'triceps'], 'intermediate', ['Wide hands; lower towards one hand while the other arm stays straight. Alternate.']),
  sw('diamond-push-up', 'Diamond push-up', 'reps', 'horizontal-push', ['triceps', 'chest'], 'beginner', ['Hands together under the chest, elbows close to the body.']),
  sw('clap-push-up', 'Clap push-up', 'reps', 'horizontal-push', ['chest', 'triceps'], 'intermediate', ['Push explosively, clap, land with soft elbows.']),
  sw('pike-push-up', 'Pike push-up', 'reps', 'vertical-push', ['shoulders', 'triceps'], 'beginner', ['Hips high, head moves between the hands. Feet on a box to make it harder.']),
  sw('wall-handstand-hold', 'Wall handstand hold', 'time', 'vertical-push', ['shoulders', 'triceps'], 'intermediate', ['Chest to the wall, arms locked, body in one line, push the floor away.']),
  sw('negative-pull-up', 'Negative pull-up', 'reps', 'vertical-pull', ['lats', 'biceps'], 'beginner', ['Jump or step to chin over the bar, lower in 3–5 s to a full hang.']),
  sw('archer-pull-up', 'Archer pull-up', 'reps', 'vertical-pull', ['lats', 'biceps'], 'expert', ['Wide grip; pull towards one hand while the other arm straightens along the bar.']),
  sw('typewriter-pull-up', 'Typewriter pull-up', 'reps', 'vertical-pull', ['lats', 'biceps'], 'expert', ['Pull up, then move side to side at the top with the chin over the bar.']),
  sw('straight-bar-dip', 'Straight bar dip', 'reps', 'vertical-push', ['triceps', 'chest'], 'intermediate', ['On top of a single bar, lean forward slightly, lower until the bar is at the upper belly.']),
  sw('toes-to-bar', 'Toes to bar', 'reps', 'core', ['abs'], 'intermediate', ['Hang, keep the legs straight and lift the toes to the bar without swinging.']),
  sw('dragon-flag', 'Dragon flag', 'reps', 'core', ['abs'], 'expert', ['Hold a bench behind the head; lower the straight body slowly, only the shoulders touching.', 'Progression: tuck, one leg, full; negatives first.']),
  sw('human-flag', 'Human flag', 'time', 'core', ['abs', 'shoulders', 'lats'], 'expert', ['Grip a vertical pole, bottom arm pushes, top arm pulls, body horizontal.']),
  sw('pistol-squat', 'Pistol squat', 'reps', 'lunge', ['quads', 'glutes'], 'intermediate', ['Squat on one leg, the other straight in front. Hold a door frame or sit to a box at first.'], 'leg'),
  sw('shrimp-squat', 'Shrimp squat', 'reps', 'lunge', ['quads', 'glutes'], 'intermediate', ['Hold the back foot behind you, lower until the back knee touches the floor.'], 'leg'),
  sw('nordic-hamstring-curl', 'Nordic hamstring curl', 'reps', 'isolation', ['hamstrings'], 'intermediate', ['Knees on a pad, ankles held; lower the straight body as slowly as possible, push back up with the hands.']),
  sw('skin-the-cat', 'Skin the cat', 'reps', 'mobility', ['shoulders', 'lats'], 'intermediate', ['Hang, tuck the knees and rotate backwards through the arms, then return slowly.']),
  sw('burpee', 'Burpee', 'reps', 'conditioning', ['quads', 'chest'], 'beginner', ['Squat, kick back to a plank, push-up, jump the feet in, jump up.']),
];

type CatalogFile = {
  exercises: Exercise[];
  enrich: Record<string, Pick<Exercise, 'muscles' | 'secondaryMuscles' | 'level' | 'instructions' | 'images'>>;
};
const CATALOG = catalog as unknown as CatalogFile;

/** All built-in exercises: the app's own (with photos and instructions), street skills, then the catalog. */
export const EXERCISES: Exercise[] = [
  ...APP_EXERCISES.map((e): Exercise => {
    const meta = APP_META[e.id];
    const extra = CATALOG.enrich[e.id];
    return {
      ...e,
      ...(extra ?? {}),
      ...(meta ? { pattern: meta.pattern, equipmentKind: meta.equipmentKind } : {}),
      ...(meta?.muscles && !extra ? { muscles: meta.muscles } : {}),
      category: e.measure === 'duration' ? 'cardio' : 'strength',
    };
  }),
  ...STREET,
  ...CATALOG.exercises,
];

export const EXERCISES_BY_ID: ReadonlyMap<string, Exercise> = new Map(EXERCISES.map((e) => [e.id, e]));
