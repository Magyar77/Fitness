// Workout builder: pick a focus, equipment, time and level, and the app assembles a workout.
// Deterministic: each focus is a list of movement "jobs" in priority order (big compound
// lifts first, then smaller muscles, then core), and every job takes the best-scoring
// exercise that fits the equipment and level and is not already in the workout.

import { defaultSlot, type SlotDraft, type WorkoutDraft } from '../custom';
import type { Demand, EquipmentKind, Exercise, Muscle, Pattern } from '../model';
import type { BodyPart } from './groups';
import { EQUIPMENT_WORDS, nameTokens } from '../import/csvLog';

export type Focus = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'arms' | 'core' | 'parts';
export type Setup = 'gym' | 'dumbbells' | 'bodyweight' | 'bands';
export type Level = NonNullable<Exercise['level']>;

export interface BuildOptions {
  focus: Focus;
  /** Body parts to train when focus is 'parts'. */
  parts?: BodyPart[];
  setup: Setup;
  minutes: 30 | 45 | 60;
  level: Level;
  /** Rotates through the top picks for a different but still sensible workout. */
  variant?: number;
}

export interface Job {
  id: string;
  label: string;
  patterns: Pattern[];
  /** The exercise's main muscle must be one of these. */
  muscles: Muscle[];
  compound: boolean;
}

const job = (id: string, label: string, patterns: Pattern[], muscles: Muscle[], compound: boolean): Job => ({ id, label, patterns, muscles, compound });

export const JOBS = {
  squat: job('squat', 'Squat', ['squat'], ['quads', 'glutes'], true),
  hinge: job('hinge', 'Hip hinge', ['hinge'], ['hamstrings', 'glutes', 'lower-back'], true),
  lunge: job('lunge', 'Single-leg', ['lunge'], ['quads', 'glutes'], true),
  hpush: job('hpush', 'Chest press', ['horizontal-push'], ['chest', 'triceps', 'shoulders'], true),
  vpush: job('vpush', 'Overhead press or dip', ['vertical-push'], ['shoulders', 'triceps'], true),
  hpull: job('hpull', 'Row', ['horizontal-pull'], ['upper-back', 'lats', 'traps'], true),
  vpull: job('vpull', 'Pull-up or pulldown', ['vertical-pull'], ['lats'], true),
  delts: job('delts', 'Shoulders', ['isolation'], ['shoulders'], false),
  rear: job('rear', 'Upper back', ['isolation', 'horizontal-pull'], ['upper-back', 'traps'], false),
  biceps: job('biceps', 'Biceps', ['isolation'], ['biceps'], false),
  triceps: job('triceps', 'Triceps', ['isolation'], ['triceps'], false),
  chest: job('chest', 'Chest', ['isolation'], ['chest'], false),
  forearms: job('forearms', 'Grip', ['isolation', 'carry'], ['forearms'], false),
  hams: job('hams', 'Hamstrings', ['isolation'], ['hamstrings'], false),
  quads: job('quads', 'Quads', ['isolation'], ['quads'], false),
  glutes: job('glutes', 'Glutes', ['isolation', 'hinge'], ['glutes'], false),
  calves: job('calves', 'Calves', ['isolation'], ['calves'], false),
  core: job('core', 'Core', ['core'], ['abs'], false),
} satisfies Record<string, Job>;

const J = JOBS;

/** Jobs per focus, most important first; the time budget decides how many are used. */
const PLANS: Record<Exclude<Focus, 'parts'>, Job[]> = {
  full: [J.squat, J.hpush, J.hinge, J.vpull, J.lunge, J.vpush, J.hpull, J.core, J.delts],
  upper: [J.hpush, J.vpull, J.vpush, J.hpull, J.delts, J.biceps, J.triceps, J.core, J.rear],
  lower: [J.squat, J.hinge, J.lunge, J.hams, J.calves, J.core, J.glutes, J.quads, J.core],
  push: [J.hpush, J.vpush, J.hpush, J.delts, J.triceps, J.chest, J.triceps, J.delts],
  pull: [J.vpull, J.hpull, J.vpull, J.rear, J.biceps, J.hpull, J.biceps, J.forearms],
  arms: [J.biceps, J.triceps, J.biceps, J.triceps, J.delts, J.forearms, J.biceps, J.triceps],
  core: [J.core, J.core, J.core, J.core, J.core, J.core, J.core, J.core],
};

const PART_JOBS: Record<BodyPart, Job[]> = {
  chest: [J.hpush, J.hpush, J.chest],
  back: [J.vpull, J.hpull, J.rear, J.hpull],
  shoulders: [J.vpush, J.delts, J.rear, J.delts],
  arms: [J.biceps, J.triceps, J.biceps, J.triceps],
  legs: [J.squat, J.hinge, J.lunge, J.hams, J.calves, J.quads],
  glutes: [J.hinge, J.lunge, J.glutes],
  core: [J.core, J.core, J.core],
};

export const FOCUS_LABEL: Record<Focus, string> = {
  full: 'Full body', upper: 'Upper body', lower: 'Lower body', push: 'Push', pull: 'Pull', arms: 'Arms', core: 'Core', parts: 'Custom',
};

export const SETUP_LABEL: Record<Setup, string> = { gym: 'Full gym', dumbbells: 'Dumbbells', bodyweight: 'Street / bodyweight', bands: 'Home with bands' };

const SETUP_SHORT: Record<Setup, string> = { gym: 'gym', dumbbells: 'dumbbells', bodyweight: 'street', bands: 'bands' };

export const SETUP_HELP: Record<Setup, string> = {
  gym: 'Barbells, dumbbells, cables and machines.',
  dumbbells: 'Dumbbells or kettlebells, plus bodyweight.',
  bodyweight: 'Bodyweight only; assumes a pull-up bar and dip bars, like a street workout park.',
  bands: 'Resistance bands and bodyweight; no bar needed.',
};

const SETUP_KINDS: Record<Setup, EquipmentKind[]> = {
  gym: ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebell', 'bodyweight', 'bands', 'other'],
  dumbbells: ['dumbbell', 'kettlebell', 'bodyweight'],
  bodyweight: ['bodyweight'],
  bands: ['bands', 'bodyweight'],
};

/** Jobs for a list of body parts: the first job of each part, then the second, and so on. */
export function jobsForParts(parts: BodyPart[]): Job[] {
  const out: Job[] = [];
  const longest = Math.max(0, ...parts.map((p) => PART_JOBS[p].length));
  for (let i = 0; i < longest; i++) for (const p of parts) if (PART_JOBS[p][i]) out.push(PART_JOBS[p][i]!);
  return out;
}

export function jobsFor(o: BuildOptions): Job[] {
  const all = o.focus === 'parts' ? jobsForParts(o.parts ?? []) : PLANS[o.focus];
  const count = { 30: 4, 45: 6, 60: 8 }[o.minutes] - (o.level === 'beginner' ? 1 : 0);
  return all.slice(0, count);
}

/** Program drills and cardio that the builder never picks on its own. */
const SKIP = new Set(['scapular-pull-up', 'assisted-negative-pull-up', 'dead-hang', 'bike-or-incline-walk']);
const LEVEL_RANK: Record<Level, number> = { beginner: 0, intermediate: 1, expert: 2 };
const ODD_NAME = /\s-\s|\bwith\b|chains|version|variation|smith|\bon\b|reverse band|powerlifting|\(/i;
const JUMPY = /jump|explosive|plyo|clap|speed|jerk|snatch|\bclean\b/i;
/** Niche or tricky catalog variants that make poor default picks. */
const AWKWARD = /pullover|around the worlds?|rope climb|london bridges?|kipping|jefferson|off pins|bottoms?.up|anderson|zercher|bradford|tate press|body-up|car drivers/i;
/** Needs a pull-up or dip bar, which a home-with-bands setup may not have. */
const NEEDS_BAR = /pull-?up|chin-?up|\bdips?\b|inverted row|muscle.?up|hanging|toes to bar|lever|skin the cat/i;

function fits(e: Exercise, j: Job, o: BuildOptions): boolean {
  if (SKIP.has(e.id) || !e.pattern || !e.muscles?.length) return false;
  if (!['strength', 'calisthenics', 'powerlifting', undefined].includes(e.category)) return false;
  if (!j.patterns.includes(e.pattern) || !j.muscles.includes(e.muscles[0]!)) return false;
  if (!SETUP_KINDS[o.setup].includes(e.equipmentKind ?? 'other')) return false;
  if (o.setup === 'bands' && NEEDS_BAR.test(e.name)) return false;
  if (e.loadType === 'assisted_machine' && o.level !== 'beginner') return false;
  if (e.level && LEVEL_RANK[e.level] > LEVEL_RANK[o.level]) return false;
  return e.measure === 'reps' || e.measure === 'time';
}

function score(e: Exercise, j: Job, o: BuildOptions, picked: Exercise[]): number {
  let s = 0;
  if (e.custom) s += 2;
  else if (e.id.startsWith('sw-')) s += o.setup === 'bodyweight' ? 4.5 : 1;
  else if (e.id.startsWith('band-')) s += o.setup === 'bands' ? 4.5 : 0;
  else if (!e.id.startsWith('fx-')) s += 4; // the app's own, hand-checked exercises
  else if (ODD_NAME.test(e.name)) s -= 2;
  if (e.images?.length) s += 1;
  // Closer to your level is better: a beginner gets the easy version, an expert the hard one.
  s += e.level ? 1.5 * (1 - Math.abs(LEVEL_RANK[e.level] - LEVEL_RANK[o.level]) / 2) : 0.75;
  if (JUMPY.test(e.name)) s -= 1.5;
  if (AWKWARD.test(e.name)) s -= 2.5;
  // Main lifts are better as reps than as skill holds (planche, levers, flags).
  if (e.measure === 'time' && j.compound) s -= 2.5;
  if (e.measure === 'time' && e.level === 'expert') s -= 1.5;
  const kind = e.equipmentKind;
  if (o.setup === 'gym') s += j.compound ? (kind === 'barbell' ? 1.5 : kind === 'dumbbell' ? 1 : 0) : kind === 'cable' || kind === 'dumbbell' || kind === 'machine' ? 1 : 0;
  if (o.setup === 'dumbbells' && kind === 'dumbbell') s += 1;
  if (o.setup === 'bands' && kind === 'bands') s += 1;
  // Variety: a second pick for the same job prefers different equipment.
  if (picked.some((p) => p.pattern === e.pattern && p.equipmentKind === kind)) s -= 1.5;
  return s - e.name.length / 50;
}

/** All exercises that can do a job, best first. */
export function candidates(all: Exercise[], j: Job, o: BuildOptions, picked: Exercise[] = []): Exercise[] {
  const taken = new Set(picked.map((p) => p.id));
  return all
    .filter((e) => !taken.has(e.id) && fits(e, j, o))
    .map((e) => ({ e, s: score(e, j, o, picked) }))
    .sort((a, b) => b.s - a.s || a.e.id.localeCompare(b.e.id))
    .map((x) => x.e);
}

/** Exercises that can stand in for this one (same movement and main muscle), its listed alternatives first. */
export function similarExercises(e: Exercise, all: Exercise[], limit = 8): Exercise[] {
  const j: Job = { id: 'swap', label: 'Swap', patterns: e.pattern ? [e.pattern] : [], muscles: e.muscles?.slice(0, 1) ?? [], compound: e.pattern !== 'isolation' && e.pattern !== 'core' };
  const byId = new Map(all.map((x) => [x.id, x]));
  const listed = e.alternatives.map((a) => byId.get(a)).filter((x): x is Exercise => !!x && x.id !== e.id);
  const open: BuildOptions = { focus: 'full', setup: 'gym', minutes: 60, level: 'intermediate' };
  const sameJob = j.patterns.length && j.muscles.length ? candidates(all, j, open, [e, ...listed]) : [];
  // Same way of recording first (reps vs time), so the planned sets still make sense;
  // then names that share a word with the original ("pulldown", "press", "raise").
  const words = (n: string) => new Set(nameTokens(n).filter((w) => !EQUIPMENT_WORDS.includes(w)));
  const own = words(e.name);
  const shared = (x: Exercise) => [...words(x.name)].filter((w) => own.has(w)).length;
  // Alternate the closest name with the best general pick, so a taken machine still has other options.
  const rank = new Map(sameJob.map((x, i) => [x.id, i]));
  const measureFirst = (a: Exercise, b: Exercise) => Number(a.measure !== e.measure) - Number(b.measure !== e.measure);
  const byName = [...sameJob].sort((a, b) => measureFirst(a, b) || Math.min(shared(b), 2) - Math.min(shared(a), 2) || rank.get(a.id)! - rank.get(b.id)!);
  const byScore = [...sameJob].sort((a, b) => measureFirst(a, b) || rank.get(a.id)! - rank.get(b.id)!);
  const out = [...listed];
  for (let i = 0; out.length < limit && i < sameJob.length; i++) {
    for (const x of [byName[i]!, byScore[i]!]) if (out.length < limit && !out.some((o) => o.id === x.id)) out.push(x);
  }
  return out;
}

/** Sets, reps, effort and rest for a pick, by level and job. */
export function targetsFor(e: Exercise, j: Job, level: Level): SlotDraft {
  const base = defaultSlot(e);
  if (e.measure === 'time') return { ...base, sets: level === 'beginner' ? 2 : 3, min: level === 'expert' ? 20 : 15, max: level === 'expert' ? 45 : 30 };
  const bodyweight = e.loadType === 'bodyweight';
  if (!j.compound) return { ...base, sets: level === 'beginner' ? 2 : 3, min: bodyweight ? 10 : 10, max: bodyweight ? 20 : 15, rirMin: 1, rirMax: 2, restMin: 60, restMax: 90 };
  if (bodyweight) return { ...base, sets: 3, min: e.level === 'expert' ? 3 : 6, max: e.level === 'expert' ? 8 : 15, rirMin: 1, rirMax: 3, restMin: 90, restMax: 120 };
  const reps = { beginner: [8, 12], intermediate: [6, 10], expert: [5, 8] }[level];
  return { ...base, sets: level === 'expert' ? 4 : 3, min: reps[0]!, max: reps[1]!, rirMin: level === 'beginner' ? 2 : 1, rirMax: level === 'beginner' ? 3 : 2, restMin: 120, restMax: level === 'expert' ? 180 : 150 };
}

export interface BuiltSlot {
  job: Job;
  exercise: Exercise;
  draft: SlotDraft;
}

export interface Built {
  name: string;
  demand: Demand;
  slots: BuiltSlot[];
  /** Jobs nothing in the library could fill with this equipment and level. */
  skipped: Job[];
}

export function buildFromOptions(all: Exercise[], o: BuildOptions): Built {
  const picked: Exercise[] = [];
  const slots: BuiltSlot[] = [];
  const skipped: Job[] = [];
  for (const j of jobsFor(o)) {
    const list = candidates(all, j, o, picked);
    if (!list.length) {
      skipped.push(j);
      continue;
    }
    // Variants rotate through the top three picks so the workout stays sensible.
    const e = list[(o.variant ?? 0) % Math.min(3, list.length)]!;
    picked.push(e);
    slots.push({ job: j, exercise: e, draft: targetsFor(e, j, o.level) });
  }
  const label = o.focus === 'parts' ? (o.parts ?? []).map((p) => p[0]!.toUpperCase() + p.slice(1)).join(' + ') || 'Custom' : FOCUS_LABEL[o.focus];
  return {
    name: `${label}${o.setup === 'gym' ? '' : ` · ${SETUP_SHORT[o.setup]}`} (${o.minutes} min)`,
    demand: o.focus === 'core' || o.focus === 'arms' ? 'moderate' : o.minutes === 60 && o.level !== 'beginner' ? 'hard' : 'moderate',
    slots,
    skipped,
  };
}

/** The next exercise for the same job, skipping anything already in the workout. */
export function swapSlot(all: Exercise[], built: Built, index: number, o: BuildOptions): Built {
  const slot = built.slots[index];
  if (!slot) return built;
  const others = built.slots.filter((_, i) => i !== index).map((s) => s.exercise);
  const list = candidates(all, slot.job, o, others);
  if (list.length < 2) return built;
  const at = list.findIndex((e) => e.id === slot.exercise.id);
  const e = list[(at + 1) % list.length]!;
  return { ...built, slots: built.slots.map((s, i) => (i === index ? { job: s.job, exercise: e, draft: targetsFor(e, s.job, o.level) } : s)) };
}

export function toWorkoutDraft(b: Built): WorkoutDraft {
  return { name: b.name, demand: b.demand, notes: '', slots: b.slots.map((s) => s.draft) };
}
