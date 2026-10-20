// Turns a finished workout into stored decisions and applies them to the adaptive layer.
// Prescriptions are append-only: undo marks one revoked; nothing is deleted or rewritten.

import { addDays } from '../engine/dates';
import type { Prescription, TemplateSlot } from '../engine/model';
import {
  activePrescription,
  DEFAULT_SETTINGS,
  evaluateSlot,
  performancesFor,
  progressionKeys,
  type DecisionRecord,
  type TargetDraft,
} from '../engine/progression';
import { getEquipment } from './equipment';
import type { FitnessDB } from './db';
import { currentProgram, exerciseById, findTemplate } from './workouts';

function newId(): string {
  return crypto.randomUUID();
}

const SAME_FIELDS = ['loadKg', 'assistKg', 'timeSec', 'distanceM', 'requirePause'] as const;

/** True when the draft would not change anything about the current target. */
function sameTarget(draft: TargetDraft, current: Prescription | null): boolean {
  if (!current) return false;
  for (const k of SAME_FIELDS) if (k in draft && draft[k] !== current[k]) return false;
  if (draft.repTargets && JSON.stringify(draft.repTargets) !== JSON.stringify(current.repTargets ?? null)) return false;
  // "Next pin above X" has no number: the text is the only thing that tells targets apart.
  if ((draft.loadKg === null || draft.assistKg === null) && draft.text !== current.text) return false;
  return true;
}

function prescriptionFrom(decision: DecisionRecord, draft: TargetDraft, source: 'engine' | 'user', effectiveFrom: string): Prescription {
  const { text, ...values } = draft;
  return {
    id: newId(),
    ...(decision.linkGroup ? { linkGroup: decision.linkGroup } : { slotKey: decision.slotKey }),
    effectiveFrom,
    ...values,
    text,
    status: 'active',
    quality: 'confirmed',
    source,
    sourceRef: source === 'engine' ? `Engine ${decision.rulesetVersion}, after ${decision.basisDate}` : `Your override, after ${decision.basisDate}`,
    decisionId: decision.id,
  };
}

const nextDay = (d: DecisionRecord) => addDays(d.basisDate ?? new Date().toISOString().slice(0, 10), 1);

/**
 * Evaluates every exercise performed in a completed session. Safe to call twice:
 * a session that already has decisions is left alone.
 */
export async function evaluateSession(db: FitnessDB, sessionId: string, now = new Date()): Promise<DecisionRecord[]> {
  const session = await db.sessions.get(sessionId);
  if (!session || session.status !== 'completed') return [];
  const existing = await db.decisions.where('basisSessionId').equals(sessionId).toArray();
  if (existing.length) return existing;

  const template = await findTemplate(db, session);
  if (!template) return [];
  const program = template.kind === 'program' ? await currentProgram(db) : null;
  const allSlots: TemplateSlot[] = program ? program.templates.flatMap((t) => t.slots) : template.slots;
  const [sessions, prescriptions, equipment] = await Promise.all([db.sessions.toArray(), db.prescriptions.toArray(), getEquipment(db)]);

  const records: DecisionRecord[] = [];
  const created: Prescription[] = [];
  const done = new Set<string>(); // one decision per link group

  for (const slot of template.slots) {
    const scope = slot.linkGroup ?? slot.slotKey;
    if (done.has(scope)) continue;
    const keys = progressionKeys(slot, allSlots);
    const sets = await db.sets.where('slotKey').anyOf(keys).toArray();
    if (!sets.some((s) => s.sessionId === sessionId && s.completed)) continue;
    const exercise = await exerciseById(db, slot.exerciseId);
    if (!exercise) continue;
    done.add(scope);

    const current = activePrescription(prescriptions, slot, session.date);
    const decision = evaluateSlot({
      slot,
      template,
      exercise,
      equipment: equipment.find((e) => e.id === exercise.equipmentProfileId),
      current,
      history: performancesFor(sessions, sets, keys, session.date).filter((p) => p.session.date < session.date || p.session.id === sessionId),
      settings: DEFAULT_SETTINGS,
    });
    if (decision.outcome === 'none') continue;

    const record: DecisionRecord = { ...decision, id: newId(), status: decision.apply === 'auto' ? 'auto_applied' : 'pending', createdAt: now.toISOString() };
    if (record.status === 'auto_applied' && decision.next && !sameTarget(decision.next, current)) {
      const rx = prescriptionFrom(record, decision.next, 'engine', nextDay(record));
      record.prescriptionId = rx.id;
      created.push(rx);
    }
    records.push(record);
  }

  await db.transaction('rw', db.decisions, db.prescriptions, async () => {
    if (await db.decisions.where('basisSessionId').equals(sessionId).count()) return; // raced with another call
    await db.prescriptions.bulkAdd(created);
    await db.decisions.bulkAdd(records);
  });
  return db.decisions.where('basisSessionId').equals(sessionId).toArray();
}

async function load(db: FitnessDB, id: string): Promise<DecisionRecord> {
  const d = await db.decisions.get(id);
  if (!d) throw new Error('Recommendation not found.');
  return d;
}

/** Accept a pending recommendation: its target becomes current from the next day. */
export async function acceptDecision(db: FitnessDB, id: string): Promise<void> {
  await db.transaction('rw', db.decisions, db.prescriptions, async () => {
    const d = await load(db, id);
    if (d.status !== 'pending') return;
    if (!d.next) {
      await db.decisions.update(id, { status: 'accepted' });
      return;
    }
    const rx = prescriptionFrom(d, d.next, 'engine', nextDay(d));
    await db.prescriptions.add(rx);
    await db.decisions.update(id, { status: 'accepted', prescriptionId: rx.id });
  });
}

/** Reject a pending recommendation: the current target stays. */
export async function rejectDecision(db: FitnessDB, id: string): Promise<void> {
  const d = await load(db, id);
  if (d.status === 'pending') await db.decisions.update(id, { status: 'rejected' });
}

/** Replace the recommendation (pending or already applied) with your own target. */
export async function overrideDecision(db: FitnessDB, id: string, draft: TargetDraft): Promise<void> {
  await db.transaction('rw', db.decisions, db.prescriptions, async () => {
    const d = await load(db, id);
    if (d.status === 'rejected' || d.status === 'undone') return;
    if (d.prescriptionId) await db.prescriptions.update(d.prescriptionId, { status: 'revoked' });
    const rx = prescriptionFrom(d, draft, 'user', nextDay(d));
    await db.prescriptions.add(rx);
    await db.decisions.update(id, { status: 'overridden', override: draft, prescriptionId: rx.id });
  });
}

/** Undo an applied change: its target is revoked and the previous target is current again. */
export async function undoDecision(db: FitnessDB, id: string): Promise<void> {
  await db.transaction('rw', db.decisions, db.prescriptions, async () => {
    const d = await load(db, id);
    if (!['auto_applied', 'accepted', 'overridden'].includes(d.status)) return;
    if (d.prescriptionId) await db.prescriptions.update(d.prescriptionId, { status: 'revoked' });
    await db.decisions.update(id, { status: 'undone' });
  });
}

export async function pendingDecisions(db: FitnessDB): Promise<DecisionRecord[]> {
  return (await db.decisions.where('status').equals('pending').toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
