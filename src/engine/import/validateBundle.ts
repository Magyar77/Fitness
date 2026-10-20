// Checks a DataBundle against a program and the exercise library before it is merged.
// Returns human-readable problems; an empty list means the bundle is safe to import.

import { daysBetween } from '../dates';
import type { DataBundle, Exercise, ProgramVersion } from '../model';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function validDate(d: string): boolean {
  if (!ISO.test(d)) return false;
  try {
    daysBetween(d, d);
    return true;
  } catch {
    return false;
  }
}

export function validateBundle(
  bundle: DataBundle,
  programs: ProgramVersion[],
  exercises: ReadonlyMap<string, Exercise>,
): string[] {
  const problems: string[] = [];
  if (bundle.format !== 'personal-fitness-bundle' || bundle.version !== 1) {
    return [`Unsupported bundle format: ${String(bundle.format)} v${String(bundle.version)}`];
  }

  const slots = new Map<string, { exerciseId: string; programId: string; code: string }>();
  const linkGroups = new Set<string>();
  for (const p of programs) {
    for (const t of p.templates) {
      for (const s of t.slots) {
        slots.set(`${p.id}/${s.slotKey}`, { exerciseId: s.exerciseId, programId: p.id, code: t.code });
        if (s.linkGroup) linkGroups.add(s.linkGroup);
      }
    }
  }
  const anySlot = (slotKey: string) => programs.some((p) => slots.has(`${p.id}/${slotKey}`));

  const sessions = new Map(bundle.sessions.map((s) => [s.id, s]));
  if (sessions.size !== bundle.sessions.length) problems.push('Duplicate session ids');

  for (const s of bundle.sessions) {
    if (!validDate(s.date)) problems.push(`Session ${s.id}: invalid date ${s.date}`);
    if (s.programVersionId && !programs.some((p) => p.id === s.programVersionId)) {
      problems.push(`Session ${s.id}: unknown program ${s.programVersionId}`);
    }
    if (s.fatigue !== null && (s.fatigue < 1 || s.fatigue > 5)) problems.push(`Session ${s.id}: fatigue out of 1–5`);
  }

  const setIds = new Set<string>();
  for (const set of bundle.sets) {
    if (setIds.has(set.id)) problems.push(`Duplicate set id ${set.id}`);
    setIds.add(set.id);
    const session = sessions.get(set.sessionId);
    if (!session) {
      problems.push(`Set ${set.id}: unknown session ${set.sessionId}`);
      continue;
    }
    if (!exercises.has(set.exerciseId)) problems.push(`Set ${set.id}: unknown exercise ${set.exerciseId}`);
    if (set.slotKey !== null && session.programVersionId) {
      const slot = slots.get(`${session.programVersionId}/${set.slotKey}`);
      if (!slot) problems.push(`Set ${set.id}: slot ${set.slotKey} not in ${session.programVersionId}`);
      else {
        if (slot.code !== session.templateCode) problems.push(`Set ${set.id}: slot ${set.slotKey} not in workout ${session.templateCode}`);
        if (slot.exerciseId !== set.exerciseId) problems.push(`Set ${set.id}: exercise ${set.exerciseId} ≠ slot exercise ${slot.exerciseId}`);
      }
    }
    if (set.rir && set.rir.min > set.rir.max) problems.push(`Set ${set.id}: RIR range reversed`);
    for (const k of ['weightKg', 'assistKg', 'reps', 'durationSec', 'distanceM'] as const) {
      const v = set[k];
      if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) problems.push(`Set ${set.id}: invalid ${k} ${v}`);
    }
  }

  for (const p of bundle.prescriptions) {
    if (!validDate(p.effectiveFrom)) problems.push(`Prescription ${p.id}: invalid date`);
    if (Boolean(p.slotKey) === Boolean(p.linkGroup)) problems.push(`Prescription ${p.id}: needs exactly one of slotKey/linkGroup`);
    if (p.slotKey && !anySlot(p.slotKey)) problems.push(`Prescription ${p.id}: unknown slot ${p.slotKey}`);
    if (p.linkGroup && !linkGroups.has(p.linkGroup)) problems.push(`Prescription ${p.id}: unknown link group ${p.linkGroup}`);
  }

  for (const w of bundle.weekPlans) {
    if (!validDate(w.weekStart)) problems.push(`Week plan ${w.weekStart}: invalid date`);
    for (const e of w.entries) {
      const offset = daysBetween(w.weekStart, e.date);
      if (offset < 0 || offset > 6) problems.push(`Week plan ${w.weekStart}: ${e.date} outside the week`);
      if (w.restDays.includes(e.date)) problems.push(`Week plan ${w.weekStart}: workout on rest day ${e.date}`);
      if (e.sessionId && !sessions.has(e.sessionId)) problems.push(`Week plan ${w.weekStart}: unknown session ${e.sessionId}`);
    }
  }

  for (const b of bundle.bodyWeights) {
    if (!validDate(b.date)) problems.push(`Body weight ${b.date}: invalid date`);
    if (!(b.kg > 20 && b.kg < 400)) problems.push(`Body weight ${b.date}: implausible ${b.kg} kg`);
  }

  return problems;
}
