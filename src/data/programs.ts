// Choosing, creating and editing programs. Program versions are immutable: every edit
// saves a new version (parent link kept), so past sessions always open as they were.

import { buildWorkout, validateWorkout, type WorkoutDraft } from '../engine/custom';
import type { IsoDate } from '../engine/dates';
import type { ProgramVersion, WorkoutTemplate } from '../engine/model';
import { READY_MADE } from '../engine/program/templates';
import { settingsForProgram } from '../engine/scheduling';
import { exerciseMap, startingTargets } from './custom';
import type { FitnessDB } from './db';
import { activateProgram, currentProgram, NO_PROGRAM } from './workouts';
import { weekStart } from '../engine/dates';

const shortId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 6);
const CODES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Removes planned (not done) entries from today on. Used when the program changes, because
 * planned entries refer to the previous program's workouts. Completed workouts stay.
 */
async function clearFuturePlanned(db: FitnessDB, today: IsoDate, onlyCodes?: Set<string>): Promise<void> {
  const plans = await db.weekPlans.where('weekStart').aboveOrEqual(weekStart(today)).toArray();
  for (const p of plans) {
    const entries = p.entries.filter((e) => !(e.state === 'planned' && e.date >= today && (!onlyCodes || onlyCodes.has(e.templateCode))));
    if (entries.length !== p.entries.length) await db.weekPlans.put({ ...p, entries });
  }
}

export function readyMade(): ProgramVersion[] {
  return READY_MADE;
}

/** A new, editable version of `base` (or an empty program) that becomes the active one. */
async function saveVersion(db: FitnessDB, base: ProgramVersion | null, changes: Partial<ProgramVersion>, changeNote: string, today: IsoDate): Promise<ProgramVersion> {
  const templates = changes.templates ?? base?.templates ?? [];
  const order = changes.canonicalOrder ?? templates.map((t) => t.code);
  const version: ProgramVersion = {
    id: `user-${shortId()}`,
    label: changes.label ?? (base && !base.isOriginal ? base.label : base ? `${base.label} (edited)` : 'My program'),
    parentId: base && base.id !== NO_PROGRAM.id ? base.id : null,
    createdAt: today,
    source: 'user_edit',
    isOriginal: false,
    changeNote,
    canonicalOrder: order,
    notes: base?.notes ?? [],
    pullUpMilestones: base?.pullUpMilestones ?? [],
    templates,
    // Keep the base's weekly order rule for its workouts; new workouts go last.
    schedule: base && base.id !== NO_PROGRAM.id ? extendSchedule(settingsForProgram(base), order) : { referenceOrder: order, keepPriority: order },
    about: { level: 'custom', daysPerWeek: templates.length, description: base?.about?.description ?? 'Your own program.' },
  };
  await db.programs.add(version);
  await activateProgram(db, version.id);
  return version;
}

function extendSchedule(s: { referenceOrder: string[]; keepPriority: string[] }, codes: string[]) {
  const keep = (list: string[]) => [...list.filter((c) => codes.includes(c)), ...codes.filter((c) => !list.includes(c))];
  return { referenceOrder: keep(s.referenceOrder), keepPriority: keep(s.keepPriority) };
}

/** Use a program as it is (ready-made programs, Program v2, or a saved version). */
export async function chooseProgram(db: FitnessDB, programId: string, today?: IsoDate): Promise<void> {
  if (programId !== NO_PROGRAM.id && !(await db.programs.get(programId))) throw new Error('Program not found.');
  const before = await currentProgram(db);
  await activateProgram(db, programId);
  if (today && before.id !== programId) await clearFuturePlanned(db, today);
}

/** Start an empty program of your own. */
export async function createOwnProgram(db: FitnessDB, today: IsoDate, label = 'My program'): Promise<ProgramVersion> {
  const version = await saveVersion(db, null, { label, templates: [] }, 'Started your own program.', today);
  await clearFuturePlanned(db, today);
  return version;
}

/**
 * Add or change one workout of the active program. Slot keys of existing exercises are
 * kept so history and targets stay attached; starting weights become targets.
 */
export async function saveProgramWorkout(
  db: FitnessDB,
  draft: WorkoutDraft,
  today: IsoDate,
  existingCode?: string,
): Promise<{ ok: true; program: ProgramVersion; workout: WorkoutTemplate } | { ok: false; problems: string[] }> {
  const base = await currentProgram(db);
  const exercises = await exerciseMap(db);
  const others = base.templates.filter((t) => t.code !== existingCode).map((t) => ({ ...t, kind: 'custom' as const }));
  const problems = validateWorkout(draft, exercises, others);
  if (problems.length) return { ok: false, problems };

  const existing = base.templates.find((t) => t.code === existingCode);
  const code = existing?.code ?? CODES.split('').find((c) => !base.templates.some((t) => t.code === c)) ?? `W${base.templates.length + 1}`;
  // New exercises get a fresh random slot key; existing ones keep theirs (history, targets).
  const built = buildWorkout(draft, exercises, { id: existing?.id ?? `${code}-${shortId()}`, code, newSlotKey: () => `${code}-${shortId()}${shortId()}` });
  // An exercise that stays in its slot keeps its special rules (e.g. a tempo or pause
  // milestone, a fixed step, a link to the same exercise in another workout) and its name.
  const slots = built.slots.map((slot) => {
    const old = existing?.slots.find((o) => o.slotKey === slot.slotKey && o.exerciseId === slot.exerciseId);
    return old ? { ...slot, name: old.name, rule: old.rule, ...(old.linkGroup ? { linkGroup: old.linkGroup } : {}) } : slot;
  });
  const workout: WorkoutTemplate = {
    ...built,
    slots,
    kind: 'program',
    focus: existing?.focus ?? built.focus,
    pullUpWork: existing?.pullUpWork ?? '—',
    pullRole: existing?.pullRole === 'main' ? 'main' : built.pullRole,
    estMinutes: existing?.estMinutes ?? null,
  };
  const templates = existing ? base.templates.map((t) => (t.code === code ? workout : t)) : [...base.templates, workout];
  const added = await startingTargets(db, workout, draft, exercises, today);
  const program = await saveVersion(db, base, { templates }, existing ? `Changed workout ${code} (${workout.name}).` : `Added workout ${code} (${workout.name}).`, today);
  if (added.length) await db.prescriptions.bulkAdd(added);
  return { ok: true, program, workout };
}

export async function removeProgramWorkout(db: FitnessDB, code: string, today: IsoDate): Promise<ProgramVersion> {
  const base = await currentProgram(db);
  const t = base.templates.find((x) => x.code === code);
  if (!t) throw new Error('Workout not found.');
  const version = await saveVersion(db, base, { templates: base.templates.filter((x) => x.code !== code) }, `Removed workout ${code} (${t.name}).`, today);
  await clearFuturePlanned(db, today, new Set([code]));
  return version;
}

/** Move a workout earlier (-1) or later (+1) in the weekly order. */
export async function moveProgramWorkout(db: FitnessDB, code: string, by: -1 | 1, today: IsoDate): Promise<ProgramVersion> {
  const base = await currentProgram(db);
  const order = [...base.canonicalOrder];
  const i = order.indexOf(code);
  const j = i + by;
  if (i < 0 || j < 0 || j >= order.length) return base;
  [order[i], order[j]] = [order[j]!, order[i]!];
  const changes: Partial<ProgramVersion> = { canonicalOrder: order };
  const version = await saveVersion(db, base, changes, `Moved workout ${code} ${by < 0 ? 'earlier' : 'later'} in the week.`, today);
  // Moving is an explicit choice of order: the schedule follows it exactly.
  const updated = { ...version, schedule: { referenceOrder: order, keepPriority: order } };
  await db.programs.put(updated);
  return updated;
}

/**
 * Programs to offer under "Change program": the ready-made ones, plus Program v2 and your own
 * versions only where they are yours (active, or used in past workouts).
 */
export async function programChoices(db: FitnessDB): Promise<ProgramVersion[]> {
  const active = await currentProgram(db);
  const used = new Set((await db.sessions.toArray()).map((s) => s.programVersionId).filter(Boolean) as string[]);
  const all = await db.programs.toArray();
  const latestOwn = new Map<string, ProgramVersion>();
  for (const p of all.filter((x) => !x.isOriginal)) {
    // One entry per lineage: the newest version (by creation, then id).
    let root = p;
    while (root.parentId) {
      const parent = all.find((x) => x.id === root.parentId);
      if (!parent || parent.isOriginal) break;
      root = parent;
    }
    const cur = latestOwn.get(root.id);
    if (!cur || p.createdAt > cur.createdAt || (p.createdAt === cur.createdAt && isDescendant(all, p, cur))) latestOwn.set(root.id, p);
  }
  const v2 = all.find((p) => p.id === 'program-v2');
  const showV2 = v2 && (active.id === v2.id || active.parentId === v2.id || used.has(v2.id));
  return [...READY_MADE, ...(showV2 ? [v2] : []), ...latestOwn.values()];
}

function isDescendant(all: ProgramVersion[], p: ProgramVersion, of: ProgramVersion): boolean {
  let cur: ProgramVersion | undefined = p;
  while (cur?.parentId) {
    if (cur.parentId === of.id) return true;
    cur = all.find((x) => x.id === cur!.parentId);
  }
  return false;
}

/** Earlier versions of the active program, newest first (for "version history"). */
export async function programHistory(db: FitnessDB): Promise<ProgramVersion[]> {
  const chain: ProgramVersion[] = [];
  let p: ProgramVersion | undefined = await currentProgram(db);
  while (p && p.id !== NO_PROGRAM.id) {
    chain.push(p);
    p = p.parentId ? await db.programs.get(p.parentId) : undefined;
  }
  return chain;
}
