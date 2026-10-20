// Starting, autosaving, resuming and finishing workouts.

import { weekStart, type IsoDate } from '../engine/dates';
import { EXERCISES_BY_ID } from '../engine/library/exercises';
import { planSets, targetText } from '../engine/logging';
import type { Discomfort, Exercise, ProgramVersion, SetLog, TemplateSlot, WorkoutSession, WorkoutTemplate } from '../engine/model';
import { activePrescription, performancesFor, progressionKeys, type SlotPerformance } from '../engine/progression';
import { PROGRAM_V2_ID } from '../engine/program/programV2';
import type { FitnessDB } from './db';

export async function currentProgram(db: FitnessDB): Promise<ProgramVersion> {
  const settings = await db.settings.get('activeProgramId');
  const id = typeof settings?.value === 'string' ? settings.value : PROGRAM_V2_ID;
  const program = await db.programs.get(id);
  if (!program) throw new Error(`Program ${id} is missing`);
  return program;
}

export async function exerciseById(db: FitnessDB, id: string): Promise<Exercise | undefined> {
  return EXERCISES_BY_ID.get(id) ?? (await db.exercises.get(id));
}

export async function findTemplate(db: FitnessDB, session: Pick<WorkoutSession, 'templateCode' | 'programVersionId'>): Promise<WorkoutTemplate | undefined> {
  if (session.programVersionId) {
    const program = await db.programs.get(session.programVersionId);
    return program?.templates.find((t) => t.code === session.templateCode);
  }
  return db.templates.where('code').equals(session.templateCode ?? '').first();
}

export async function inProgressSession(db: FitnessDB): Promise<WorkoutSession | undefined> {
  const open = await db.sessions.where('status').equals('in_progress').toArray();
  return open.sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? '')).at(-1);
}

/** The most recent completed performance of this slot (or its link group) before `date`. */
export async function lastPerformance(db: FitnessDB, template: WorkoutTemplate, slot: TemplateSlot, beforeSessionId: string | null): Promise<SlotPerformance | null> {
  const keys = progressionKeys(slot, template.slots.concat(await otherSlots(db, template)));
  const sets = await db.sets.where('slotKey').anyOf(keys).toArray();
  const sessionIds = [...new Set(sets.map((s) => s.sessionId))].filter((id) => id !== beforeSessionId);
  const sessions = (await db.sessions.bulkGet(sessionIds)).filter((s): s is WorkoutSession => !!s);
  return performancesFor(sessions, sets, keys).at(-1) ?? null;
}

async function otherSlots(db: FitnessDB, template: WorkoutTemplate): Promise<TemplateSlot[]> {
  // Link groups span workouts of the same program (e.g. lateral raises in A and D).
  if (template.kind !== 'program') return [];
  const program = await currentProgram(db);
  return program.templates.filter((t) => t.code !== template.code).flatMap((t) => t.slots);
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Starts a workout, or returns the one already in progress for the same workout and day.
 * Freezes the targets that apply today and pre-fills one not-yet-completed row per set.
 */
export async function startSession(db: FitnessDB, template: WorkoutTemplate, programVersionId: string | null, date: IsoDate, now = new Date()): Promise<string> {
  const open = await db.sessions.where('status').equals('in_progress').toArray();
  const existing = open.find((s) => s.date === date && s.templateCode === template.code);
  if (existing) return existing.id;

  const id = newId();
  const prescriptions = await db.prescriptions.toArray();
  const snapshot: { slotKey: string; text: string }[] = [];
  const sets: SetLog[] = [];
  for (const slot of template.slots) {
    const exercise = await exerciseById(db, slot.exerciseId);
    if (!exercise) continue;
    const rx = activePrescription(prescriptions, slot, date);
    snapshot.push({ slotKey: slot.slotKey, text: targetText(slot, rx) });
    const last = await lastPerformance(db, template, slot, null);
    planSets(slot, exercise, rx, last).forEach((p, i) => {
      sets.push({ id: `${id}:${slot.slotKey}:${i + 1}`, sessionId: id, slotKey: slot.slotKey, exerciseId: slot.exerciseId, setIndex: i + 1, completed: false, techniqueOk: true, isWarmup: false, quality: 'confirmed', ...p });
    });
  }

  const session: WorkoutSession = {
    id,
    date,
    templateCode: template.code,
    programVersionId,
    status: 'in_progress',
    startedAt: now.toISOString(),
    finishedAt: null,
    fatigue: null,
    discomfort: [],
    conditions: [],
    notes: [],
    flags: [],
    prescriptionSnapshot: snapshot,
  };

  await db.transaction('rw', db.sessions, db.sets, db.weekPlans, async () => {
    await db.sessions.add(session);
    await db.sets.bulkAdd(sets);
    const plan = await db.weekPlans.get(weekStart(date));
    const entry = plan?.entries.find((e) => e.date === date && e.templateCode === template.code && !e.sessionId);
    if (plan && entry) {
      entry.sessionId = id;
      await db.weekPlans.put(plan);
    }
  });
  return id;
}

/** Autosave: writes one set immediately. */
export async function saveSet(db: FitnessDB, set: SetLog): Promise<void> {
  await db.sets.put(set);
}

export async function addSet(db: FitnessDB, sessionId: string, slotKey: string): Promise<SetLog> {
  const existing = (await db.sets.where('sessionId').equals(sessionId).toArray()).filter((s) => s.slotKey === slotKey).sort((a, b) => a.setIndex - b.setIndex);
  const last = existing.at(-1);
  if (!last) throw new Error(`No sets for ${slotKey}`);
  const index = last.setIndex + 1;
  const { notes: _notes, drops: _drops, editedAt: _edited, ...values } = last;
  const set: SetLog = { ...values, id: `${sessionId}:${slotKey}:${index}`, setIndex: index, completed: false, techniqueOk: true };
  await db.sets.add(set);
  return set;
}

export async function removeSet(db: FitnessDB, setId: string): Promise<void> {
  await db.sets.delete(setId);
}

export async function updateSession(db: FitnessDB, id: string, changes: Partial<Pick<WorkoutSession, 'fatigue' | 'notes' | 'conditions' | 'discomfort'>>): Promise<void> {
  await db.sessions.update(id, changes);
}

export async function addDiscomfort(db: FitnessDB, id: string, d: Discomfort): Promise<void> {
  const s = await db.sessions.get(id);
  if (s) await db.sessions.update(id, { discomfort: [...s.discomfort, d] });
}

/** Marks the workout completed and the matching week-plan entry done. */
export async function finishSession(db: FitnessDB, id: string, details: { fatigue: number | null; notes: string[] }, now = new Date()): Promise<void> {
  await db.transaction('rw', db.sessions, db.weekPlans, async () => {
    const s = await db.sessions.get(id);
    if (!s || s.status !== 'in_progress') return;
    await db.sessions.update(id, { status: 'completed', finishedAt: now.toISOString(), fatigue: details.fatigue, notes: details.notes });
    const plan = await db.weekPlans.get(weekStart(s.date));
    if (!plan) return;
    const entry = plan.entries.find((e) => e.sessionId === id) ?? plan.entries.find((e) => e.date === s.date && e.templateCode === s.templateCode && e.state === 'planned');
    if (entry) {
      entry.state = 'done';
      entry.sessionId = id;
    } else if (s.templateCode) {
      plan.entries.push({ date: s.date, templateCode: s.templateCode, origin: 'manual', state: 'done', sessionId: id });
      plan.entries.sort((a, b) => a.date.localeCompare(b.date));
    }
    await db.weekPlans.put(plan);
  });
}

/** Discards an in-progress workout and its sets (nothing completed is ever deleted). */
export async function discardSession(db: FitnessDB, id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, db.weekPlans, async () => {
    const s = await db.sessions.get(id);
    if (!s || s.status !== 'in_progress') return;
    await db.sets.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
    const plan = await db.weekPlans.get(weekStart(s.date));
    const entry = plan?.entries.find((e) => e.sessionId === id);
    if (plan && entry) {
      delete entry.sessionId;
      await db.weekPlans.put(plan);
    }
  });
}
