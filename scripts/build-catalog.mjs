// Converts free-exercise-db (public domain, https://github.com/yuhonas/free-exercise-db)
// into the app's exercise format: src/engine/library/catalog.json.
//
//   curl -L -o /tmp/fedb.json https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
//   node scripts/build-catalog.mjs /tmp/fedb.json
//
// Muscles, region, movement pattern, equipment and recording type are derived by fixed rules
// below, so the output is reproducible. Entries that duplicate an app exercise are not added
// as separate exercises; their photos and instructions enrich the app exercise instead.

import { readFileSync, writeFileSync } from 'node:fs';

const input = process.argv[2];
if (!input) {
  console.error('usage: node scripts/build-catalog.mjs <exercises.json>');
  process.exit(1);
}
const source = JSON.parse(readFileSync(input, 'utf8'));

/** App exercise id → dataset id (same exercise). */
const SAME_AS = {
  'scapular-pull-up': 'Scapular_Pull-Up',
  'pull-up': 'Pullups',
  'barbell-bench-press': 'Barbell_Bench_Press_-_Medium_Grip',
  'seated-db-shoulder-press': 'Dumbbell_Shoulder_Press',
  'incline-db-press': 'Incline_Dumbbell_Press',
  'db-lateral-raise': 'Side_Lateral_Raise',
  'cable-triceps-pushdown': 'Triceps_Pushdown',
  'db-bench-press': 'Dumbbell_Bench_Press',
  'overhead-cable-triceps': 'Cable_Rope_Overhead_Triceps_Extension',
  'lat-pulldown': 'Wide-Grip_Lat_Pulldown',
  'single-arm-db-row': 'One-Arm_Dumbbell_Row',
  'cable-face-pull': 'Face_Pull',
  'barbell-curl': 'Barbell_Curl',
  'incline-db-curl': 'Incline_Dumbbell_Curl',
  'seated-cable-row': 'Seated_Cable_Rows',
  'farmers-carry': 'Farmers_Walk',
  'barbell-back-squat': 'Barbell_Squat',
  'romanian-deadlift': 'Romanian_Deadlift',
  'db-bulgarian-split-squat': 'Split_Squat_with_Dumbbells',
  'leg-curl': 'Lying_Leg_Curls',
  'leg-press': 'Leg_Press',
  'db-walking-lunge': 'Dumbbell_Lunges',
  'back-extension-45': 'Hyperextensions_Back_Extensions',
  'dead-bug': 'Dead_Bug',
  'side-plank': 'Side_Bridge',
  'push-up': 'Pushups',
  'goblet-squat': 'Goblet_Squat',
  'barbell-overhead-press': 'Standing_Military_Press',
  'barbell-row': 'Bent_Over_Barbell_Row',
  'deadlift': 'Barbell_Deadlift',
  'hip-thrust': 'Barbell_Hip_Thrust',
  'plank': 'Plank',
  'standing-calf-raise': 'Standing_Calf_Raises',
};

const MUSCLE = {
  abdominals: 'abs', quadriceps: 'quads', 'middle back': 'upper-back', 'lower back': 'lower-back',
  hamstrings: 'hamstrings', adductors: 'adductors', abductors: 'abductors', biceps: 'biceps', shoulders: 'shoulders',
  chest: 'chest', calves: 'calves', glutes: 'glutes', lats: 'lats', triceps: 'triceps', traps: 'traps', forearms: 'forearms', neck: 'neck',
};
const LOWER = new Set(['quads', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves', 'lower-back']);
const CORE = new Set(['abs']);

const CATEGORY = { strength: 'strength', stretching: 'mobility', plyometrics: 'plyometrics', strongman: 'strongman', powerlifting: 'powerlifting', cardio: 'cardio', 'olympic weightlifting': 'olympic' };

/** Recording type from the equipment. */
function load(eq) {
  switch (eq) {
    case 'barbell': return { loadType: 'plates', equipmentProfileId: 'barbell-plates', kind: 'barbell', convention: 'Plates only, bar not counted.' };
    case 'dumbbell': return { loadType: 'dumbbell_per_hand', equipmentProfileId: 'dumbbells', kind: 'dumbbell', convention: 'Weight per hand.' };
    case 'kettlebells': return { loadType: 'dumbbell_per_hand', equipmentProfileId: 'dumbbells', kind: 'kettlebell', convention: 'Weight per kettlebell.' };
    case 'cable': return { loadType: 'cable', equipmentProfileId: 'cable-stack', kind: 'cable', convention: 'Weight on the stack.' };
    case 'machine': return { loadType: 'machine', equipmentProfileId: 'machine-stack', kind: 'machine', convention: 'Weight on the stack.' };
    case 'e-z curl bar': return { loadType: 'barbell_total', equipmentProfileId: 'barbell-plates', kind: 'barbell', convention: 'Total weight including the bar.' };
    case 'bands': return { loadType: 'bodyweight', kind: 'bands', convention: 'Band: note the band in the set notes.' };
    case 'medicine ball': case 'other': return { loadType: 'machine', equipmentProfileId: 'machine-stack', kind: 'other', convention: 'Weight used, if any.' };
    default: return { loadType: 'bodyweight', kind: 'bodyweight', convention: 'Bodyweight.' };
  }
}

function pattern(e, name, primary) {
  if (e.category === 'stretching') return 'mobility';
  if (e.category === 'cardio' || e.category === 'plyometrics') return 'conditioning';
  if (/farmer|carry|yoke|suitcase/.test(name)) return 'carry';
  if (CORE.has(primary)) return 'core';
  if (e.mechanic === 'isolation') return 'isolation';
  if (LOWER.has(primary)) {
    if (/lunge|split|step-?up|pistol|bulgarian|single-leg squat|one-leg/.test(name)) return 'lunge';
    if (primary === 'quads') return 'squat';
    if (['hamstrings', 'glutes', 'lower-back'].includes(primary)) return 'hinge';
    return 'isolation';
  }
  if (e.force === 'push' || /press|push-?up|dip/.test(name)) {
    return primary === 'shoulders' || /overhead|military|shoulder press|handstand|pike|arnold|jerk|push press/.test(name) ? 'vertical-push' : 'horizontal-push';
  }
  if (e.force === 'pull' || /row|pull|chin|pulldown/.test(name)) {
    if (primary === 'traps' || /shrug/.test(name)) return 'isolation';
    return primary === 'lats' || /pull-?up|pulldown|chin/.test(name) ? 'vertical-pull' : 'horizontal-pull';
  }
  return 'isolation';
}

function measure(e, name) {
  if (e.category === 'cardio') return 'duration';
  if (e.category === 'stretching') return 'time';
  if (e.force === 'static' && /plank|hold|hang|bridge|wall sit|isometric|l-sit/.test(name)) return 'time';
  return 'reps';
}

function perSide(name) {
  if (/side bridge|side plank/.test(name)) return 'side';
  if (/one-?arm|single-?arm|alternat/.test(name)) return 'arm';
  if (/one-?leg|single-?leg|lunge|split squat|step-?up|pistol|bulgarian/.test(name)) return 'leg';
  return undefined;
}

const slug = (id) => `fx-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
const appOf = new Map(Object.entries(SAME_AS).map(([app, ds]) => [ds, app]));

const exercises = [];
const enrich = {};
for (const e of source) {
  const name = e.name.toLowerCase();
  const muscles = [...new Set((e.primaryMuscles ?? []).map((m) => MUSCLE[m]).filter(Boolean))];
  const secondary = [...new Set((e.secondaryMuscles ?? []).map((m) => MUSCLE[m]).filter((m) => m && !muscles.includes(m)))];
  const primary = muscles[0];
  const meta = {
    muscles,
    secondaryMuscles: secondary,
    level: e.level,
    instructions: (e.instructions ?? []).map((s) => s.trim()).filter(Boolean),
    images: e.images ?? [],
  };
  const app = appOf.get(e.id);
  if (app) {
    enrich[app] = meta; // keep the app's own exercise; add photos, instructions and muscles
    continue;
  }
  // Bar and floor skills are bodyweight even when the dataset lists "other" equipment.
  const bodyweightSkill = e.equipment === 'other' && /muscle up|pull-?up|chin-?up|dips?\b|handstand|l-sit|lever|planche/.test(name);
  const l = load(bodyweightSkill ? 'body only' : e.equipment);
  const p = pattern(e, name, primary);
  const region = !primary ? null : CORE.has(primary) ? 'core' : LOWER.has(primary) ? 'lower' : 'upper';
  const side = perSide(name);
  exercises.push({
    id: slug(e.id),
    name: e.name,
    loadType: l.loadType,
    measure: measure(e, name),
    loadConvention: l.convention,
    cues: [],
    alternatives: [],
    ...(l.equipmentProfileId ? { equipmentProfileId: l.equipmentProfileId } : {}),
    tags: [CATEGORY[e.category] ?? 'strength', ...(muscles.includes('forearms') || p === 'carry' ? ['grip'] : [])],
    custom: false,
    region: e.category === 'cardio' ? null : region,
    pull: (p === 'vertical-pull' || p === 'horizontal-pull') && e.mechanic === 'compound',
    ...(side ? { perSide: side } : {}),
    pattern: p,
    equipmentKind: l.kind,
    category: CATEGORY[e.category] ?? 'strength',
    ...meta,
  });
}

const missing = Object.entries(SAME_AS).filter(([app]) => !enrich[app]).map(([app, ds]) => `${app} → ${ds}`);
if (missing.length) {
  console.error(`Dataset ids not found:\n${missing.join('\n')}`);
  process.exit(1);
}

exercises.sort((a, b) => a.name.localeCompare(b.name));
const out = new URL('../src/engine/library/catalog.json', import.meta.url);
writeFileSync(out, JSON.stringify({ source: 'free-exercise-db (public domain, Unlicense)', exercises, enrich }));
console.log(`catalog.json: ${exercises.length} exercises, ${Object.keys(enrich).length} app exercises enriched`);
