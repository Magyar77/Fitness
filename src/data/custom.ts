// Custom exercises and workouts. They live beside the program and never modify it.

import { buildExercise, buildWorkout, toDraft, validateExercise, validateWorkout, type CustomExerciseInput, type WorkoutDraft } from '../engine/custom';
import { weekStart, type IsoDate } from '../engine/dates';
import { EXERCISES } from '../engine/library/exercises';
import type { Exercise, Prescription, TemplateSlot, WeekPlan, WorkoutTemplate } from '../engine/model';
import { activePrescription } from '../engine/progression';
import type { ScheduleWarning } from '../engine/scheduling';
import type { FitnessDB } from './db';
import { checkWeek, loadWeekContext } from './weeks';
import { getProfile } from './profile';
import { formatLoad } from '../engine/units';
import { currentProgram } from './workouts';

const shortId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 6);

export async function allExercises(db: FitnessDB): Promise<Exercise[]> {
  const custom = await db.exercises.toArray();
  return [...EXERCISES, ...custom].sort((a, b) => a.name.localeCompare(b.name));
}

export async function exerciseMap(db: FitnessDB): Promise<Map<string, Exercise>> {
  return new Map((await allExercises(db)).map((e) => [e.id, e]));
}

export async function customWorkouts(db: FitnessDB, includeArchived = false): Promise<WorkoutTemplate[]> {
  const all = await db.templates.toArray();
  return all.filter((t) => includeArchived || !t.archived).sort((a, b) => a.name.localeCompare(b.name));
}

/** Program workouts plus your own (not archived): everything the planner and Today can show. */
export async function allTemplates(db: FitnessDB): Promise<WorkoutTemplate[]> {
  const program = await currentProgram(db);
  return [...program.templates, ...(await customWorkouts(db))];
}

export async function saveExercise(db: FitnessDB, input: CustomExerciseInput, editingId?: string): Promise<{ ok: true; exercise: Exercise } | { ok: false; problems: string[] }> {
  const problems = validateExercise(input, await allExercises(db), editingId);
  if (problems.length) return { ok: false, problems };
  if (editingId && !(await db.exercises.get(editingId))) return { ok: false, problems: ['Built-in exercises cannot be edited.'] };
  const exercise = buildExercise(input, editingId ?? `custom-${shortId()}`);
  await db.exercises.put(exercise);
  return { ok: true, exercise };
}

function loadOf(rx: Prescription | null, assisted: boolean): number | null {
  const v = assisted ? rx?.assistKg : rx?.loadKg;
  return typeof v === 'number' ? v : null;
}

/** The current starting weight for a custom slot, from its targets. */
export async function targetKgFor(db: FitnessDB, slot: TemplateSlot, exercises: ReadonlyMap<string, Exercise>, on: IsoDate): Promise<number | null> {
  const rx = activePrescription(await db.prescriptions.where('slotKey').equals(slot.slotKey).toArray(), slot, on);
  return loadOf(rx, exercises.get(slot.exerciseId)?.loadType === 'assisted_machine');
}

export async function draftOf(db: FitnessDB, t: WorkoutTemplate, on: IsoDate): Promise<WorkoutDraft> {
  const exercises = await exerciseMap(db);
  const targets = new Map<string, number | null>();
  for (const s of t.slots) targets.set(s.slotKey, await targetKgFor(db, s, exercises, on));
  return toDraft(t, (s) => targets.get(s.slotKey) ?? null);
}

/**
 * Creates or updates a custom workout. A changed starting weight is recorded as a new
 * target from `today`; the program and past sessions are untouched.
 */
/**
 * New targets for starting weights entered in a workout draft (only where they differ from
 * the current target). Shared by custom workouts and program workouts.
 */
export async function startingTargets(db: FitnessDB, workout: WorkoutTemplate, draft: WorkoutDraft, exercises: ReadonlyMap<string, Exercise>, today: IsoDate): Promise<Prescription[]> {
  const prescriptions = await db.prescriptions.toArray();
  const { unit } = await getProfile(db);
  const added: Prescription[] = [];
  workout.slots.forEach((slot, i) => {
    const kg = draft.slots[i]!.targetKg;
    if (kg === null) return;
    const assisted = exercises.get(slot.exerciseId)?.loadType === 'assisted_machine';
    if (loadOf(activePrescription(prescriptions, slot, today), assisted) === kg) return;
    const reps = slot.target.kind === 'reps' && slot.sets ? Array(slot.sets).fill(slot.target.min) : undefined;
    added.push({
      id: crypto.randomUUID(),
      slotKey: slot.slotKey,
      effectiveFrom: today,
      ...(assisted ? { assistKg: kg } : { loadKg: kg }),
      ...(reps ? { repTargets: reps } : {}),
      text: `${formatLoad(kg, unit)}${assisted ? ' assist' : ''}${reps ? `, ${slot.sets} × ${slot.target.kind === 'reps' ? `${slot.target.min}–${slot.target.max}` : ''}` : ''}`,
      status: 'active',
      quality: 'confirmed',
      source: 'user',
      sourceRef: `Starting weight set in "${workout.name}"`,
    });
  });
  return added;
}

export async function saveWorkout(
  db: FitnessDB,
  draft: WorkoutDraft,
  today: IsoDate,
  existing?: WorkoutTemplate,
): Promise<{ ok: true; workout: WorkoutTemplate } | { ok: false; problems: string[] }> {
  const exercises = await exerciseMap(db);
  const problems = validateWorkout(draft, exercises, await customWorkouts(db), existing?.code);
  if (problems.length) return { ok: false, problems };

  const code = existing?.code ?? `X-${shortId()}`;
  const workout = buildWorkout(draft, exercises, { id: existing?.id ?? code, code, newSlotKey: () => `${code}-${shortId()}` });
  if (existing?.archived) workout.archived = true;

  const added = await startingTargets(db, workout, draft, exercises, today);

  await db.transaction('rw', db.templates, db.prescriptions, async () => {
    await db.templates.put(workout);
    if (added.length) await db.prescriptions.bulkAdd(added);
  });
  return { ok: true, workout };
}

export async function duplicateWorkout(db: FitnessDB, code: string, today: IsoDate): Promise<WorkoutTemplate> {
  const source = await db.templates.where('code').equals(code).first();
  if (!source) throw new Error('Workout not found.');
  const draft = await draftOf(db, source, today);
  const names = new Set((await customWorkouts(db)).map((t) => t.name.toLowerCase()));
  let name = `${source.name} (copy)`;
  for (let i = 2; names.has(name.toLowerCase()); i++) name = `${source.name} (copy ${i})`;
  const r = await saveWorkout(db, { ...draft, name, slots: draft.slots.map((s) => ({ ...s, slotKey: '' })) }, today);
  if (!r.ok) throw new Error(r.problems.join(' '));
  return r.workout;
}

/**
 * "Delete": hides the workout and removes its future planned entries. It is kept
 * (archived) so completed sessions of it still open.
 */
export async function archiveWorkout(db: FitnessDB, code: string, today: IsoDate): Promise<void> {
  await db.transaction('rw', db.templates, db.weekPlans, async () => {
    const t = await db.templates.where('code').equals(code).first();
    if (!t) return;
    await db.templates.put({ ...t, archived: true });
    const plans = await db.weekPlans.where('weekStart').aboveOrEqual(weekStart(today)).toArray();
    for (const p of plans) {
      const entries = p.entries.filter((e) => !(e.templateCode === code && e.state === 'planned' && e.date >= today));
      if (entries.length !== p.entries.length) await db.weekPlans.put({ ...p, entries });
    }
  });
}

/** Adds a workout to a day of that week's plan (creating the plan if needed) and checks the week. */
export async function scheduleWorkout(db: FitnessDB, code: string, date: IsoDate): Promise<ScheduleWarning[]> {
  const start = weekStart(date);
  const ctx = await loadWeekContext(db, start);
  const plan: WeekPlan = ctx.plan ?? { weekStart: start, restDays: ctx.suggestedRest, unavailableDays: [], status: 'saved', entries: [...ctx.completed], notes: [] };
  const entries = [...plan.entries, { date, templateCode: code, origin: 'manual' as const, state: 'planned' as const }].sort((a, b) => a.date.localeCompare(b.date));
  await db.weekPlans.put({ ...plan, entries, status: 'saved' });
  return checkWeek(ctx, await allTemplates(db), entries, plan.restDays, plan.unavailableDays);
}
