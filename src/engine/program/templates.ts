// Ready-made full-body programs for people starting fresh. General, well-established
// structures (compound lifts first, a pull and a push each day, legs, core), meant as
// editable starting points rather than personal prescriptions.

import { buildWorkout, type SlotDraft } from '../custom';
import { EXERCISES_BY_ID } from '../library/exercises';
import type { Demand, ProgramVersion, WorkoutTemplate } from '../model';

type Pair = [number, number];

/** One exercise: sets, rep/time/distance range, RIR range (null for none), rest seconds. */
function s(exerciseId: string, sets: number, range: Pair, rir: Pair | null, rest: Pair | null, notes = ''): SlotDraft {
  if (!EXERCISES_BY_ID.has(exerciseId)) throw new Error(`Unknown exercise ${exerciseId}`);
  return {
    slotKey: '',
    exerciseId,
    sets,
    min: range[0],
    max: range[1],
    rirMin: rir?.[0] ?? null,
    rirMax: rir?.[1] ?? null,
    restMin: rest?.[0] ?? null,
    restMax: rest?.[1] ?? null,
    notes,
    targetKg: null,
    supersetWithPrevious: false,
  };
}

function workout(prefix: string, code: string, name: string, focus: string, demand: Demand, slots: SlotDraft[], notes = ''): WorkoutTemplate {
  let n = 0;
  const t = buildWorkout({ name, demand, notes, slots }, EXERCISES_BY_ID, {
    id: `${prefix}-${code}`,
    code,
    newSlotKey: () => `${prefix}-${code}-${String(++n).padStart(2, '0')}`,
  });
  return { ...t, kind: 'program', focus, pullUpWork: '—', estMinutes: Math.round(slots.reduce((m, x) => m + x.sets * 2.5, 5) / 5) * 5 };
}

function program(id: string, label: string, about: NonNullable<ProgramVersion['about']>, templates: WorkoutTemplate[], notes: string[]): ProgramVersion {
  const order = templates.map((t) => t.code);
  return {
    id,
    label,
    parentId: null,
    createdAt: '2026-10-20',
    source: 'import',
    isOriginal: true,
    changeNote: 'Ready-made program included with the app.',
    canonicalOrder: order,
    notes,
    pullUpMilestones: [],
    templates,
    schedule: { referenceOrder: order, keepPriority: order },
    about,
  };
}

const COMMON_NOTES = [
  'Warm up 5–10 minutes, then do one or two lighter ramp-up sets before the first exercise.',
  'Weight goes up only when every set reaches the top of its rep range at the target RIR with clean technique.',
  'RIR (reps in reserve) = how many more good reps you could have done. RIR 2 = stop two reps before failure.',
  'Sharp or joint pain means stop that exercise. Muscle burn and normal fatigue are fine.',
];

export const BEGINNER_3_DAY = program(
  'tpl-beginner-3',
  'Beginner · 3-day full body',
  { level: 'beginner', daysPerWeek: 3, description: 'Three full-body sessions a week with a rest day between them. Machines and dumbbells, moderate effort, plenty in reserve while you learn the movements.' },
  [
    workout('BEG3', 'A', 'Full body A', 'Squat, press, pull, hinge, core', 'moderate', [
      s('goblet-squat', 3, [8, 12], [2, 3], [90, 120]),
      s('db-bench-press', 3, [8, 12], [2, 3], [90, 120]),
      s('lat-pulldown', 3, [8, 12], [2, 3], [90, 90]),
      s('romanian-deadlift', 2, [8, 12], [2, 3], [120, 120]),
      s('plank', 3, [20, 40], null, [60, 60]),
    ]),
    workout('BEG3', 'B', 'Full body B', 'Legs, shoulders, row, core', 'moderate', [
      s('leg-press', 3, [10, 12], [2, 3], [90, 120]),
      s('seated-db-shoulder-press', 3, [8, 12], [2, 3], [90, 90]),
      s('seated-cable-row', 3, [10, 12], [2, 3], [90, 90]),
      s('leg-curl', 2, [10, 12], [2, 2], [60, 60]),
      s('dead-bug', 2, [8, 8], null, [45, 45]),
    ]),
    workout('BEG3', 'C', 'Full body C', 'Lunge, push-up, pull-up, back, core', 'moderate', [
      s('db-walking-lunge', 2, [10, 10], [2, 3], [90, 90]),
      s('push-up', 3, [6, 15], [2, 2], [90, 90], 'Too hard? Hands on a bench.'),
      s('assisted-pull-up', 3, [6, 10], [2, 2], [120, 120]),
      s('back-extension-45', 2, [10, 15], [2, 2], [60, 60]),
      s('side-plank', 2, [20, 30], null, [45, 45]),
    ]),
  ],
  [...COMMON_NOTES, 'Aim for Monday / Wednesday / Friday or any pattern with a day off between sessions.'],
);

export const INTERMEDIATE_4_DAY = program(
  'tpl-intermediate-4',
  'Intermediate · 4-day full body',
  { level: 'intermediate', daysPerWeek: 4, description: 'Four full-body sessions: two heavier strength days built on squat, bench, deadlift and overhead press, and two volume days. Closer to failure (RIR 1–2).' },
  [
    workout('INT4', 'A', 'Strength A', 'Squat and bench', 'hard', [
      s('barbell-back-squat', 4, [5, 8], [2, 2], [150, 180]),
      s('barbell-bench-press', 4, [5, 8], [2, 2], [150, 180]),
      s('single-arm-db-row', 3, [8, 12], [1, 2], [90, 90]),
      s('leg-curl', 3, [10, 12], [1, 2], [60, 60]),
      s('hanging-knee-raise', 3, [8, 12], [1, 2], [60, 60]),
    ]),
    workout('INT4', 'B', 'Volume B', 'Hinge, vertical pull, shoulders', 'moderate', [
      s('romanian-deadlift', 3, [6, 10], [2, 2], [120, 120]),
      s('lat-pulldown', 4, [8, 12], [1, 2], [90, 90]),
      s('seated-db-shoulder-press', 3, [8, 12], [1, 2], [90, 90]),
      s('db-bulgarian-split-squat', 3, [8, 10], [2, 2], [90, 90]),
      s('cable-face-pull', 2, [12, 15], [2, 2], [60, 60]),
    ]),
    workout('INT4', 'C', 'Volume C', 'Legs, incline press, row, shoulders', 'moderate', [
      s('leg-press', 3, [10, 15], [1, 2], [120, 120]),
      s('incline-db-press', 3, [8, 12], [1, 2], [90, 90]),
      s('seated-cable-row', 3, [10, 12], [1, 2], [90, 90]),
      s('db-lateral-raise', 3, [12, 15], [1, 2], [60, 60]),
      s('hollow-body-hold', 3, [20, 40], null, [60, 60]),
    ]),
    workout('INT4', 'D', 'Strength D', 'Deadlift and overhead press', 'hard', [
      s('deadlift', 3, [4, 6], [2, 2], [180, 180]),
      s('barbell-overhead-press', 3, [5, 8], [2, 2], [120, 120]),
      s('assisted-pull-up', 3, [6, 10], [1, 2], [120, 120]),
      s('db-walking-lunge', 2, [10, 10], [2, 2], [90, 90]),
      s('barbell-curl', 2, [8, 12], [1, 1], [60, 60]),
      s('cable-triceps-pushdown', 2, [10, 12], [1, 1], [60, 60]),
    ]),
  ],
  [...COMMON_NOTES, 'Keep the two strength days (A and D) apart, e.g. Mon A / Tue B / Thu C / Fri D.'],
);

export const EXPERT_5_DAY = program(
  'tpl-expert-5',
  'Expert · 5-day full body',
  { level: 'expert', daysPerWeek: 5, description: 'Five full-body sessions with heavy, medium and light days so you can train often and still recover. Heavy triples to fives on the big lifts, RIR 0–2.' },
  [
    workout('EXP5', 'A', 'Heavy A', 'Heavy squat and bench', 'hard', [
      s('barbell-back-squat', 5, [3, 5], [1, 2], [180, 180]),
      s('barbell-bench-press', 5, [3, 5], [1, 2], [180, 180]),
      s('barbell-row', 4, [6, 8], [1, 2], [120, 120]),
      s('hanging-knee-raise', 3, [10, 15], [1, 2], [60, 60]),
    ]),
    workout('EXP5', 'B', 'Heavy B', 'Heavy deadlift and overhead press', 'hard', [
      s('deadlift', 4, [3, 5], [2, 2], [180, 180]),
      s('barbell-overhead-press', 4, [5, 8], [1, 2], [120, 120]),
      s('assisted-pull-up', 4, [5, 8], [1, 1], [120, 120]),
      s('leg-curl', 3, [10, 12], [1, 1], [60, 60]),
      s('cable-face-pull', 3, [12, 15], [1, 2], [60, 60]),
    ]),
    workout('EXP5', 'C', 'Light C', 'Recovery volume', 'easy', [
      s('leg-press', 3, [12, 15], [2, 3], [90, 90]),
      s('db-bench-press', 3, [10, 12], [2, 2], [90, 90]),
      s('seated-cable-row', 3, [10, 12], [2, 2], [90, 90]),
      s('db-lateral-raise', 3, [12, 15], [1, 2], [60, 60]),
      s('dead-bug', 3, [8, 8], null, [45, 45]),
    ], 'Deliberately lighter: leave fresher than you came.'),
    workout('EXP5', 'D', 'Medium D', 'Single-leg, incline press, pulldown, arms', 'moderate', [
      s('db-bulgarian-split-squat', 4, [6, 10], [1, 2], [90, 90]),
      s('incline-db-press', 4, [6, 10], [1, 2], [90, 90]),
      s('lat-pulldown', 4, [8, 12], [1, 1], [90, 90]),
      s('hip-thrust', 3, [8, 12], [1, 2], [90, 90]),
      s('barbell-curl', 3, [8, 12], [0, 1], [60, 60]),
      s('cable-triceps-pushdown', 3, [10, 12], [0, 1], [60, 60]),
    ]),
    workout('EXP5', 'E', 'Medium E', 'Hinge, push-ups, row, carries, core', 'moderate', [
      s('romanian-deadlift', 3, [6, 10], [1, 2], [120, 120]),
      s('push-up', 3, [10, 20], [1, 1], [90, 90]),
      s('single-arm-db-row', 3, [8, 12], [1, 1], [90, 90]),
      s('farmers-carry', 3, [30, 40], null, [60, 90]),
      s('side-plank', 3, [30, 45], null, [45, 45]),
    ]),
  ],
  [...COMMON_NOTES, 'Put the light day (C) between the two heavy days when you can.'],
);

export const READY_MADE: ProgramVersion[] = [BEGINNER_3_DAY, INTERMEDIATE_4_DAY, EXPERT_5_DAY];
